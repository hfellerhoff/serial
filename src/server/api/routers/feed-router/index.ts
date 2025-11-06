import type { inferRouterOutputs } from "@trpc/server";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { parseArrayOfSchema } from "~/lib/schemas/utils";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  feedsSchema,
  openLocationSchema,
} from "~/server/db/schema";
import { fetchFeedData, fetchNewFeedDetails } from "~/server/rss/fetchFeeds";
import { findExistingFeedThatMatches } from "./utils";

type BulkImportFromFileSuccess = {
  feedUrl: string;
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

export const feedRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({ url: z.string().min(5), categoryIds: z.number().array() }),
    )
    .mutation(async ({ ctx, input }) => {
      const newFeeds = await fetchNewFeedDetails(input.url);
      if (!newFeeds.length) {
        throw new Error("Unsupported feed URL");
      }

      const errors = (
        await ctx.db.transaction(async (tx) => {
          return await Promise.all(
            newFeeds.map(async (newFeed) => {
              if (!newFeed.url) return "No feed url found.";

              const existingFeed = await findExistingFeedThatMatches(tx, {
                feedUrl: newFeed.url,
                userId: ctx.auth!.user.id,
              });

              if (existingFeed) {
                return "Feed already exists";
              }

              const newFeeds = await tx
                .insert(feeds)
                .values({
                  userId: ctx.auth!.user.id,
                  ...newFeed,
                })
                .returning();

              const newFeedRow = newFeeds?.[0];

              if (!!input.categoryIds.length && !!newFeedRow) {
                await Promise.all(
                  input.categoryIds.map(async (categoryId) => {
                    return await tx.insert(feedCategories).values({
                      feedId: Number(newFeedRow.id),
                      categoryId: categoryId,
                    });
                  }),
                );
              }

              return null;
            }),
          );
        })
      ).filter(Boolean);

      if (errors.length === newFeeds.length) {
        throw new Error(errors[0]);
      }
    }),
  createFeedsFromSubscriptionImport: protectedProcedure
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
    .mutation(async ({ ctx, input }): Promise<BulkImportFromFileResult[]> => {
      if (!input.feeds.length) {
        return [];
      }

      const promiseResults = await Promise.allSettled(
        input.feeds.map(async (feed) => {
          return await ctx.db.transaction(async (tx) => {
            const newFeedDetails = await fetchNewFeedDetails(feed.feedUrl);
            const newFeed = newFeedDetails?.[0];

            if (!newFeed?.url) {
              return {
                feedUrl: feed.feedUrl,
                success: false,
                error: "Unsupported feed URL",
              };
            }

            const existingFeed = await findExistingFeedThatMatches(tx, {
              feedUrl: newFeed.url,
              userId: ctx.auth!.user.id,
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
                userId: ctx.auth!.user.id,
                ...newFeed,
              })
              .returning();
            const newFeedRow = newFeeds?.[0];

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
                  eq(contentCategories.userId, ctx.auth!.user.id),
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
                    userId: ctx.auth!.user.id,
                  })
                  .returning();
                const newContentCategory = newContentCategoryList?.[0];

                if (!newContentCategory?.id) return;

                await tx.insert(feedCategories).values({
                  feedId: newFeedRow.id,
                  categoryId: newContentCategory?.id,
                });
              },
            );

            await Promise.allSettled([
              ...matchingCategoryPromises,
              ...nonMatchingCategoryPromises,
            ]);

            return {
              feedUrl: newFeed.url,
              success: true,
            };
          });
        }),
      );

      const results: BulkImportFromFileResult[] = promiseResults
        .map((result) => {
          if (result.status === "fulfilled") {
            return result.value;
          }

          return null;
        })
        .filter(Boolean);

      return results;
    }),
  delete: protectedProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.delete(feedItems).where(eq(feedItems.feedId, input));

        await tx.delete(feedCategories).where(eq(feedCategories.feedId, input));

        await tx
          .delete(feeds)
          .where(and(eq(feeds.id, input), eq(feeds.userId, ctx.auth!.user.id)));
      });
    }),
  getAllFeedData: protectedProcedure.query(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.user.id}`,
    });

    if (!feedsList) {
      return {
        feeds: [],
        items: [],
      };
    }

    const feedData = await fetchFeedData(feedsList);

    if (!feedData) {
      return {
        feeds: feedsList,
        items: [],
      };
    }

    const feedItemList: (typeof feedItems.$inferInsert)[] =
      feedData?.flatMap((feed) => {
        return feed.items.map((item) => {
          return {
            feedId: feed.id,
            contentId: item.id,
            title: item.title ?? "",
            author: item.author ?? "",
            thumbnail: item.thumbnail ?? "",
            url: item.url ?? "",
            postedAt: new Date(item.publishedDate),
          } satisfies typeof feedItems.$inferInsert;
        });
      }) ?? [];

    await ctx.db.transaction(async (tx) => {
      return await Promise.all(
        feedItemList.map(async (item) => {
          return await tx
            .insert(feedItems)
            .values(item)
            .onConflictDoUpdate({
              target: [feedItems.url, feedItems.feedId],
              set: item,
            });
        }),
      );
    });

    const feedIds = feedsList.map((feed) => feed.id);
    if (!feedIds.length) {
      return {
        feeds: [],
        items: [],
      };
    }

    const itemsQueryData = await ctx.db
      .select()
      .from(feedItems)
      .where(inArray(feedItems.feedId, feedIds))
      .leftJoin(feedCategories, eq(feedItems.feedId, feedCategories.feedId))
      .leftJoin(
        contentCategories,
        eq(contentCategories.id, feedCategories.categoryId),
      )
      .orderBy(desc(feedItems.postedAt));

    return {
      feeds: feedsList,
      items: itemsQueryData,
    };
  }),
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const feedsList = await ctx.db.query.feeds.findMany({
      where: sql`user_id = ${ctx.auth!.user.id}`,
    });

    return parseArrayOfSchema(feedsList, feedsSchema);
  }),
  update: protectedProcedure
    .input(
      z.object({
        feedId: z.number(),
        categoryIds: z.number().array(),
        openLocation: openLocationSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.transaction(async (tx) => {
        // Feed open location
        await tx
          .update(feeds)
          .set({
            openLocation: input.openLocation,
          })
          .where(
            and(
              eq(feeds.userId, ctx.auth!.user.id),
              eq(feeds.id, input.feedId),
            ),
          );

        // Feed categories
        await tx
          .delete(feedCategories)
          .where(
            and(
              eq(feedCategories.feedId, input.feedId),
              notInArray(feedCategories.categoryId, input.categoryIds),
            ),
          );

        return await Promise.all(
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
      });
    }),
});

export type FeedRouter = inferRouterOutputs<typeof feedRouter>;
