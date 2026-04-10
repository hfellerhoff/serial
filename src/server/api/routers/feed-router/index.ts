import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { discoverFeeds as discoverFeedsFromUrl } from "feedscout";
import { z } from "zod";
import {
  findExistingFeedThatMatches,
  verifyContentCategoriesOwnedByUser,
  verifyViewsOwnedByUser,
} from "./utils";
import { parseArrayOfSchema } from "~/lib/schemas/utils";

import { prepareArrayChunks } from "~/lib/iterators";
import { dbSemaphore } from "~/lib/semaphore";
import {
  contentCategories,
  feedCategories,
  feeds,
  feedsSchema,
  openLocationSchema,
  PLATFORM_DEFAULT_OPEN_LOCATION,
  viewFeeds,
} from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchNewFeedDetails } from "~/server/rss/fetchFeeds";
import {
  canActivateFeed,
  getFeedsActivationBudget,
} from "~/server/subscriptions/helpers";

type BulkImportFromFileSuccess = {
  feedUrl: string;
  feedId: number;
  success: true;
};
type BulkImportFromFileError = {
  feedUrl: string;
  success: false;
  error: string;
};
export type BulkImportFromFileResult =
  | BulkImportFromFileError
  | BulkImportFromFileSuccess;

export const create = protectedProcedure
  .input(
    z.object({
      url: z.string().min(5),
      categoryIds: z.number().array(),
      viewIds: z.number().array().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const newFeedDetails = await fetchNewFeedDetails(input.url);
    if (!newFeedDetails.length) {
      throw new Error("Unsupported feed URL");
    }

    // Check activation budget upfront
    const { remainingSlots, maxActiveFeeds } = await getFeedsActivationBudget(
      context.db,
      context.user.id,
    );

    const results = await context.db.transaction(async (tx) => {
      const [categoriesOwned, viewsOwned] = await Promise.all([
        verifyContentCategoriesOwnedByUser({
          categoryIds: input.categoryIds,
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: input.viewIds ?? [],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!categoriesOwned) {
        throw new Error(
          "Unauthorized: One or more categories do not belong to user",
        );
      }
      if (!viewsOwned) {
        throw new Error(
          "Unauthorized: One or more views do not belong to user",
        );
      }

      return await Promise.all(
        newFeedDetails.map(async (newFeed, index) => {
          if (!newFeed.url) return { error: "No feed url found." };

          const existingFeed = await findExistingFeedThatMatches(tx, {
            feedUrl: newFeed.url,
            userId: context.user.id,
          });

          if (existingFeed) {
            return { error: "Feed already exists" };
          }

          const isActive = index < remainingSlots;

          const insertedFeeds = await tx
            .insert(feeds)
            .values({
              userId: context.user.id,
              ...newFeed,
              isActive,
              openLocation: PLATFORM_DEFAULT_OPEN_LOCATION[newFeed.platform],
            })
            .returning();

          const newFeedRow = insertedFeeds[0];

          if (!!input.categoryIds.length && !!newFeedRow) {
            await tx.insert(feedCategories).values(
              input.categoryIds.map((categoryId) => ({
                feedId: Number(newFeedRow.id),
                categoryId,
              })),
            );
          }

          if (input.viewIds?.length && newFeedRow) {
            await tx.insert(viewFeeds).values(
              input.viewIds.map((viewId) => ({
                viewId,
                feedId: Number(newFeedRow.id),
              })),
            );
          }

          return { feed: newFeedRow };
        }),
      );
    });

    const errors = results.filter((r): r is { error: string } => "error" in r);
    if (errors.length === newFeedDetails.length) {
      throw new Error(errors[0]?.error ?? "Failed to create feed");
    }

    const createdFeeds = results
      .filter(
        (r): r is { feed: typeof feeds.$inferSelect } =>
          "feed" in r && !!r.feed,
      )
      .map((r) => r.feed);

    const deactivatedCount = Math.max(0, createdFeeds.length - remainingSlots);

    return {
      feeds: parseArrayOfSchema(createdFeeds, feedsSchema),
      deactivatedCount,
      maxActiveFeeds,
    };
  });

export const createFromSubscriptionImport = protectedProcedure
  .input(
    z.object({
      feeds: z
        .object({
          feedUrl: z.string(),
          categories: z.string().array(),
        })
        .array(),
    }),
  )
  .handler(async ({ context, input }): Promise<BulkImportFromFileResult[]> => {
    if (!input.feeds.length) {
      return [];
    }

    // Check activation budget upfront and pre-calculate which feeds should be active
    const { remainingSlots } = await getFeedsActivationBudget(
      context.db,
      context.user.id,
    );

    // Pre-calculate which feeds should be active BEFORE any parallel processing
    const feedsWithActivation = input.feeds.map((feed, index) => ({
      ...feed,
      shouldBeActive: index < remainingSlots,
    }));

    // Process feeds in small batches to avoid overwhelming the database
    const BATCH_SIZE = 4;
    const feedChunks = prepareArrayChunks(feedsWithActivation, BATCH_SIZE);
    const allResults: BulkImportFromFileResult[] = [];

    for (const chunk of feedChunks) {
      const promiseResults = await Promise.allSettled(
        chunk.map(async (feed) => {
          return await dbSemaphore.run(() =>
            context.db.transaction(async (tx) => {
              const newFeedDetails = await fetchNewFeedDetails(feed.feedUrl);
              const newFeed = newFeedDetails[0];

              if (!newFeed?.url) {
                return {
                  feedUrl: feed.feedUrl,
                  success: false,
                  error: "Unsupported feed URL",
                };
              }

              const existingFeed = await findExistingFeedThatMatches(tx, {
                feedUrl: newFeed.url,
                userId: context.user.id,
              });

              if (existingFeed) {
                return {
                  feedUrl: newFeed.url,
                  success: false,
                  error: "Feed already exists",
                };
              }

              const newFeeds = await tx
                .insert(feeds)
                .values({
                  userId: context.user.id,
                  ...newFeed,
                  isActive: feed.shouldBeActive,
                  openLocation:
                    PLATFORM_DEFAULT_OPEN_LOCATION[newFeed.platform],
                })
                .returning();
              const newFeedRow = newFeeds[0];

              if (!newFeedRow) {
                return {
                  feedUrl: newFeed.url,
                  success: false,
                  error: "Couldn't find new feed",
                };
              }

              const matchingCategories = await tx
                .select()
                .from(contentCategories)
                .where(
                  and(
                    inArray(contentCategories.name, feed.categories),
                    eq(contentCategories.userId, context.user.id),
                  ),
                )
                .all();
              const matchingCategoryNames = matchingCategories.map(
                (category) => category.name,
              );

              const nonMatchingCategories = feed.categories.filter(
                (category) => !matchingCategoryNames.includes(category),
              );

              const matchingCategoryPromises = matchingCategories.map(
                async (matchingCategory) => {
                  const categoryId = matchingCategory.id;

                  return await tx.insert(feedCategories).values({
                    feedId: newFeedRow.id,
                    categoryId: categoryId,
                  });
                },
              );

              const nonMatchingCategoryPromises = nonMatchingCategories.map(
                async (nonMatchingCategory) => {
                  const newContentCategoryList = await tx
                    .insert(contentCategories)
                    .values({
                      name: nonMatchingCategory,
                      userId: context.user.id,
                    })
                    .returning();
                  const newContentCategory = newContentCategoryList[0];

                  if (!newContentCategory?.id) return;

                  await tx.insert(feedCategories).values({
                    feedId: newFeedRow.id,
                    categoryId: newContentCategory.id,
                  });
                },
              );

              await Promise.allSettled([
                ...matchingCategoryPromises,
                ...nonMatchingCategoryPromises,
              ]);

              return {
                feedUrl: newFeed.url,
                feedId: newFeedRow.id,
                success: true,
              };
            }),
          );
        }),
      );

      const chunkResults: BulkImportFromFileResult[] = promiseResults
        .map((result) => {
          if (result.status === "fulfilled") {
            return result.value;
          }
          return null;
        })
        .filter(Boolean);

      allResults.push(...chunkResults);
    }

    return allResults;
  });

const deleteFeed = protectedProcedure
  .input(z.number())
  .handler(async ({ context, input }) => {
    await context.db
      .delete(feeds)
      .where(and(eq(feeds.id, input), eq(feeds.userId, context.user.id)));
  });
export { deleteFeed as delete };

export const getAll = protectedProcedure.handler(async function* ({ context }) {
  const feedsList = await context.db.query.feeds.findMany({
    where: sql`user_id = ${context.user.id}`,
  });

  const parsed = parseArrayOfSchema(feedsList, feedsSchema);

  for (const chunk of prepareArrayChunks(parsed, 50)) {
    yield chunk;
  }

  return;
});

export const update = protectedProcedure
  .input(
    z.object({
      feedId: z.number(),
      categoryIds: z.number().array(),
      viewIds: z.number().array().optional(),
      openLocation: openLocationSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    return await context.db.transaction(async (tx) => {
      const [categoriesOwned, viewsOwned] = await Promise.all([
        verifyContentCategoriesOwnedByUser({
          categoryIds: input.categoryIds,
          userId: context.user.id,
          db: tx,
        }),
        verifyViewsOwnedByUser({
          viewIds: input.viewIds ?? [],
          userId: context.user.id,
          db: tx,
        }),
      ]);

      if (!categoriesOwned) {
        throw new Error(
          "Unauthorized: One or more categories do not belong to user",
        );
      }
      if (!viewsOwned) {
        throw new Error(
          "Unauthorized: One or more views do not belong to user",
        );
      }

      const updatedFeeds = await tx
        .update(feeds)
        .set({
          openLocation: input.openLocation,
        })
        .where(
          and(eq(feeds.userId, context.user.id), eq(feeds.id, input.feedId)),
        )
        .returning();

      const updatedFeed = updatedFeeds[0];
      if (!updatedFeed) return null;

      // Feed categories - only modify if ownership was verified above
      await tx
        .delete(feedCategories)
        .where(
          and(
            eq(feedCategories.feedId, input.feedId),
            notInArray(feedCategories.categoryId, input.categoryIds),
          ),
        );

      await Promise.all(
        input.categoryIds.map(async (categoryId) => {
          await tx
            .insert(feedCategories)
            .values({
              feedId: input.feedId,
              categoryId,
            })
            .onConflictDoNothing();
        }),
      );

      // View feeds - sync direct view assignments
      if (input.viewIds !== undefined) {
        if (input.viewIds.length === 0) {
          await tx.delete(viewFeeds).where(eq(viewFeeds.feedId, input.feedId));
        } else {
          await tx
            .delete(viewFeeds)
            .where(
              and(
                eq(viewFeeds.feedId, input.feedId),
                notInArray(viewFeeds.viewId, input.viewIds),
              ),
            );

          await tx
            .insert(viewFeeds)
            .values(
              input.viewIds.map((viewId) => ({
                viewId,
                feedId: input.feedId,
              })),
            )
            .onConflictDoNothing();
        }
      }

      return feedsSchema.parse(updatedFeed);
    });
  });

async function discoverYouTubeFeeds(url: string) {
  if (!url.includes("youtube.com/@") && !url.includes("youtube.com/channel/")) {
    return null;
  }

  try {
    const response = await fetch(url);
    const text = await response.text();

    const rssFeedUrlMatches = text.matchAll(
      /<link rel="alternate" type="application\/rss\+xml" title="RSS" href="(https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=[^&]{24})">/gm,
    );

    const channelNameMatch =
      /<meta property="og:title" content="([^"]+)">/.exec(text);
    const channelName = channelNameMatch?.[1];

    const feedUrls = Array.from(rssFeedUrlMatches)
      .map((match) => match[1])
      .filter(Boolean);

    if (feedUrls.length === 0) {
      return null;
    }

    return feedUrls.map((feedUrl) => ({
      url: feedUrl,
      title: channelName,
      format: "atom" as const,
    }));
  } catch {
    return null;
  }
}

export const bulkDelete = protectedProcedure
  .input(z.object({ feedIds: z.number().array() }))
  .handler(async ({ context, input }) => {
    await context.db
      .delete(feeds)
      .where(
        and(
          inArray(feeds.id, input.feedIds),
          eq(feeds.userId, context.user.id),
        ),
      );
  });

export const setActive = protectedProcedure
  .input(z.object({ feedId: z.number(), isActive: z.boolean() }))
  .handler(async ({ context, input }) => {
    // Verify feed belongs to user
    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      throw new Error("Feed not found");
    }

    // When activating, check feed limits
    if (input.isActive) {
      const canActivate = await canActivateFeed(context.db, context.user.id);
      if (!canActivate) {
        throw new Error(
          "Feed limit reached. Upgrade your plan to activate more feeds.",
        );
      }
    }

    const updatedFeeds = await context.db
      .update(feeds)
      .set({ isActive: input.isActive })
      .where(and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)))
      .returning();

    const updatedFeed = updatedFeeds[0];
    if (!updatedFeed) return null;

    return feedsSchema.parse(updatedFeed);
  });

export const discoverFeeds = protectedProcedure
  .input(z.object({ url: z.string().url() }))
  .handler(async ({ input }) => {
    const [youtubeResult, feedscoutResult] = await Promise.allSettled([
      discoverYouTubeFeeds(input.url),
      discoverFeedsFromUrl(input.url, {
        methods: ["platform", "html", "headers", "guess"],
      }),
    ]);

    const discoveredFeeds: Array<{
      url: string;
      title?: string;
      format?: string;
    }> = [];

    if (youtubeResult.status === "fulfilled" && youtubeResult.value) {
      discoveredFeeds.push(...youtubeResult.value);
    }

    if (feedscoutResult.status === "fulfilled") {
      const feedscoutFeeds = feedscoutResult.value.filter((f) => f.isValid);
      discoveredFeeds.push(...feedscoutFeeds);
    }

    // Deduplicate by URL and filter out invalid YouTube feeds
    const seen = new Set<string>();
    return discoveredFeeds.filter((feed) => {
      if (seen.has(feed.url)) return false;
      seen.add(feed.url);

      // Filter out YouTube feeds without channel_id
      if (
        feed.url.includes("youtube.com") &&
        !feed.url.includes("channel_id=")
      ) {
        return false;
      }
      return true;
    });
  });
