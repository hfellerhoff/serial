import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { publisher } from "../publisher";
import { getUserChannel } from "../channels";
import { insertFeedWithCategories } from "./feed-router/utils";
import type { PublishedChunk } from "../publisher";
import type { ApplicationFeed, ApplicationView } from "~/server/db/schema";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import type {
  ReconciliationScopeTarget,
  ReconciliationStreamEvent,
} from "~/lib/reconciliation";
import { loadApplicationViews } from "~/server/api/utils/loadApplicationViews";
import { captureException } from "~/server/logger";
import { getFeedsActivationBudget } from "~/server/subscriptions/helpers";
import { organizationInvalidationSummary } from "~/server/reconciliation/invalidation";
import {
  DEFAULT_VIEW_LAYOUT,
  VIEW_LAYOUT_ITEM_TYPE,
} from "~/server/db/constants";
import { dbSemaphore } from "~/lib/semaphore";
import { workerPool } from "~/lib/workerPool";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";
import {
  boundedStringsSchema,
  MAX_BULK_MUTATION_ITEMS,
} from "~/lib/schemas/bulk";
import { queryNavigationSnapshot } from "~/server/navigation/snapshot";
import { reconciliationInputSchema } from "~/server/reconciliation/input";
import { reconcileApplicationState as streamApplicationReconciliation } from "~/server/reconciliation";
import { fetchDueSources as runFetchDueSources } from "~/server/rss/fetchDueSources";
import { env } from "~/env";
import { getReconciliationTargetKey } from "~/lib/reconciliation";

export const reconcileApplicationState = protectedProcedure
  .input(reconciliationInputSchema)
  .handler(async function* ({ context, input }) {
    const stream = streamApplicationReconciliation({
      database: context.db,
      userId: context.user.id,
      request: input,
    });
    const injectViewPageFailure =
      env.SERIAL_E2E_FAULT_CONTROLS &&
      context.headers.get("x-serial-e2e-reconciliation-failure") ===
        "view-page-once";
    let activePageCount = 0;
    let failedTarget: ReconciliationScopeTarget | null = null;
    for await (const event of stream) {
      if (!injectViewPageFailure) {
        yield event;
        continue;
      }
      if (event.chunk.type === "active-first-page") {
        activePageCount++;
        if (activePageCount === 2) {
          failedTarget = event.chunk.page.target;
          continue;
        }
      }
      if (
        failedTarget &&
        event.chunk.type === "domain-complete" &&
        event.chunk.domain === "active-scope" &&
        event.chunk.target &&
        getReconciliationTargetKey(event.chunk.target) ===
          getReconciliationTargetKey(failedTarget)
      ) {
        const failureEvent: ReconciliationStreamEvent = {
          reconciliationId: input.reconciliationId,
          chunk: {
            type: "domain-error",
            failure: {
              phase: "load-view-page",
              domain: "active-scope",
              target: failedTarget,
              message: "Injected E2E View-page failure",
            },
          },
        };
        yield failureEvent;
        failedTarget = null;
        continue;
      }
      yield event;
    }
  });

export const fetchDueSources = protectedProcedure
  .input(z.object({ trigger: z.enum(["automatic", "manual"]) }))
  .handler(async ({ context, input }) =>
    runFetchDueSources({
      database: context.db,
      userId: context.user.id,
      trigger: input.trigger,
      channel: getUserChannel(context.user.id),
      publish: async (channel, chunk) => {
        await publisher.publish(channel, { source: "rss", chunk });
      },
    }),
  );

/** Fulltext content patch for items that need it after the lightweight fetch. */
export type FeedItemFulltext = {
  id: string;
  content: string;
  contentSnippet: string;
};

export type ImportProgressChunk =
  | { type: "import-start"; totalFeeds: number }
  | {
      type: "import-limit-warning";
      deactivatedCount: number;
      maxActiveFeeds: number;
    }
  | {
      type: "import-feed-inserted";
      feedUrl: string;
      feedId: number;
      feed: ApplicationFeed;
    }
  | { type: "import-feed-error"; feedUrl: string; error: string }
  | { type: "feed-status"; feedId: number; status: FetchFeedsStatus }
  | { type: "import-views-updated"; views: ApplicationView[] };

type RouterPublishedChunk = PublishedChunk;

type ChannelSubscription = {
  channel: string;
  lastEventId?: string;
};

async function* subscribeToChannels(
  subscriptions: ChannelSubscription[],
  signal: AbortSignal | undefined,
): AsyncGenerator<RouterPublishedChunk> {
  const iterators = subscriptions.map((subscription) => {
    const channelSubscription = publisher.subscribe(subscription.channel, {
      signal,
      lastEventId: subscription.lastEventId,
    });

    return channelSubscription[Symbol.asyncIterator]();
  });

  type NextResult = {
    index: number;
    result: IteratorResult<RouterPublishedChunk>;
  };

  const pending = new Map<number, Promise<NextResult>>();
  const queueNext = (index: number) => {
    const iterator = iterators[index];
    if (!iterator) return;

    pending.set(
      index,
      iterator.next().then((result) => ({
        index,
        result,
      })),
    );
  };

  iterators.forEach((_, index) => queueNext(index));

  try {
    while (pending.size > 0) {
      const { index, result } = await Promise.race(pending.values());
      pending.delete(index);

      if (result.done) {
        continue;
      }

      queueNext(index);
      yield result.value;
    }
  } finally {
    await Promise.allSettled(iterators.map((iterator) => iterator.return?.()));
  }
}

export const getNavigationSnapshot = protectedProcedure.handler(({ context }) =>
  queryNavigationSnapshot({
    database: context.db,
    userId: context.user.id,
  }),
);

// ============================================================================
// SUBSCRIPTION PROCEDURE
// ============================================================================

/**
 * Subscribe to the user's broadcast channel.
 */
export const subscribe = protectedProcedure
  .input(z.object({}))
  .handler(async function* ({ context, signal, lastEventId }) {
    const userChannel = getUserChannel(context.user.id);

    for await (const payload of subscribeToChannels(
      [{ channel: userChannel, lastEventId }],
      signal,
    )) {
      yield payload;
    }
  });

// ============================================================================
// REQUEST PROCEDURES
// ============================================================================

type ImportCategoryPathInput =
  | string
  | {
      name: string;
      type?: "view" | "tag" | "feed";
      feedUrl?: string;
    };

type NormalizedImportCategoryPathItem = {
  name: string;
  type?: "view" | "tag" | "feed";
  feedUrl?: string;
};

type NormalizedImportSubsectionItem = NormalizedImportCategoryPathItem & {
  type: "tag" | "feed";
};

function isNormalizedImportCategoryPathItem(
  item: NormalizedImportCategoryPathItem | null,
): item is NormalizedImportCategoryPathItem {
  return item !== null;
}

function normalizeImportCategoryPathItem(
  item: ImportCategoryPathInput,
): NormalizedImportCategoryPathItem | null {
  if (typeof item === "string") {
    const name = item.trim();
    return name ? { name } : null;
  }

  const name = item.name.trim();
  if (!name) return null;

  return {
    name,
    type: item.type,
    feedUrl: item.feedUrl,
  };
}

function normalizeImportCategoryPaths(feed: {
  categories: string[];
  categoryPaths?: ImportCategoryPathInput[][];
}) {
  const rawCategoryPaths =
    feed.categoryPaths && feed.categoryPaths.length > 0
      ? feed.categoryPaths
      : feed.categories.map((category) => [category]);

  return rawCategoryPaths
    .map((path) =>
      path
        .map(normalizeImportCategoryPathItem)
        .filter(isNormalizedImportCategoryPathItem),
    )
    .filter((path) => path.length > 0);
}

function getImportedSubsectionName(
  categoryPath: NormalizedImportCategoryPathItem[],
) {
  return categoryPath
    .slice(1)
    .map((category) => category.name)
    .join(" / ");
}

function getImportedSubsectionItem(
  categoryPath: NormalizedImportCategoryPathItem[],
): NormalizedImportSubsectionItem | null {
  const lastItem = categoryPath[categoryPath.length - 1];
  if (!lastItem) return null;
  const type: NormalizedImportSubsectionItem["type"] =
    lastItem.type === VIEW_LAYOUT_ITEM_TYPE.FEED ? "feed" : "tag";

  return {
    ...lastItem,
    name: getImportedSubsectionName(categoryPath),
    type,
  };
}

function getUniqueNames(names: string[]) {
  return [...new Set(names.filter((name) => !!name))];
}

/**
 * Combined streaming import endpoint that inserts feeds and fetches RSS content
 * in a single operation using a worker pool for maximum parallelism.
 * Each feed is processed completely (insert + RSS fetch) before being considered done.
 */
export const streamingImport = protectedProcedure
  .input(
    z.object({
      feeds: z
        .object({
          feedUrl: z.string(),
          categories: boundedStringsSchema,
          categoryPaths: z
            .array(
              z
                .array(
                  z.union([
                    z.string(),
                    z.object({
                      name: z.string(),
                      type: z.enum(["view", "tag", "feed"]).optional(),
                      feedUrl: z.string().optional(),
                    }),
                  ]),
                )
                .max(MAX_BULK_MUTATION_ITEMS),
            )
            .max(MAX_BULK_MUTATION_ITEMS)
            .optional(),
          tagNames: boundedStringsSchema.optional(),
        })
        .array()
        .max(MAX_BULK_MUTATION_ITEMS),
    }),
  )
  .handler(async function* ({ context, input }) {
    const channel = getUserChannel(context.user.id);
    const BATCH_SIZE = 4;
    const FEED_TIMEOUT_MS = 15_000; // 15 seconds
    // While the insert pool runs, membership invalidations are throttled so a
    // large import surfaces view memberships incrementally without publishing
    // once per feed.
    const MEMBERSHIP_PUBLISH_INTERVAL_MS = 3_000;

    if (!input.feeds.length) {
      yield {
        type: "import-start",
        totalFeeds: 0,
      } satisfies ImportProgressChunk;
      return;
    }

    // Check activation budget upfront
    const { remainingSlots, maxActiveFeeds } = await getFeedsActivationBudget(
      context.db,
      context.user.id,
    );
    const deactivatedCount = Math.max(0, input.feeds.length - remainingSlots);

    // OPML sections always become views; only explicit Serial tag metadata
    // becomes feed tags.
    const feedsWithActivation = input.feeds.map((feed, index) => ({
      feedUrl: feed.feedUrl,
      categories: getUniqueNames(feed.tagNames ?? []),
      categoryPaths: normalizeImportCategoryPaths(feed),
      shouldBeActive: index < remainingSlots,
    }));

    // Publish import start with total feeds count (must come before
    // import-limit-warning so the client's loading machine is initialized first)
    yield {
      type: "import-start",
      totalFeeds: input.feeds.length,
    } satisfies ImportProgressChunk;

    // Publish warning if some feeds will be inactive
    if (deactivatedCount > 0) {
      yield {
        type: "import-limit-warning",
        deactivatedCount,
        maxActiveFeeds,
      } satisfies ImportProgressChunk;
    }

    const publishOrganizationInvalidation = () =>
      publisher.publish(channel, {
        source: "invalidation",
        chunk: organizationInvalidationSummary(),
      });

    // Create (or reuse) views from the top-level OPML folders — plus the tag
    // categories backing nested tag sections — before any feed work, so views
    // reach the client immediately. Feeds are linked in as each insert lands.
    const viewOrder: string[] = [];
    const viewOrderSet = new Set<string>();
    const sectionOrderByViewName = new Map<
      string,
      NormalizedImportCategoryPathItem[]
    >();

    for (const feedInput of feedsWithActivation) {
      for (const categoryPath of feedInput.categoryPaths) {
        const viewName = categoryPath[0]?.name;
        if (!viewName) continue;

        if (!viewOrderSet.has(viewName)) {
          viewOrder.push(viewName);
          viewOrderSet.add(viewName);
        }

        if (categoryPath.length <= 1) continue;

        const subsectionItem = getImportedSubsectionItem(categoryPath);
        if (!subsectionItem) continue;

        const sectionOrder = sectionOrderByViewName.get(viewName);
        if (sectionOrder) {
          const hasSection = sectionOrder.some(
            (item) =>
              item.name === subsectionItem.name &&
              item.type === subsectionItem.type &&
              item.feedUrl === subsectionItem.feedUrl,
          );
          if (!hasSection) {
            sectionOrder.push(subsectionItem);
          }
        } else {
          sectionOrderByViewName.set(viewName, [subsectionItem]);
        }
      }
    }

    let viewLinking: {
      viewByName: Map<string, typeof views.$inferSelect>;
      categoryByName: Map<string, typeof contentCategories.$inferSelect>;
    } | null = null;

    if (viewOrder.length > 0) {
      viewLinking = await context.db.transaction(async (tx) => {
        // Look up existing views by name for this user
        const existingViews = await tx
          .select()
          .from(views)
          .where(eq(views.userId, context.user.id));
        const viewByName = new Map(existingViews.map((v) => [v.name, v]));

        // Insert any missing views with default settings
        const namesToCreate = viewOrder.filter((name) => !viewByName.has(name));
        if (namesToCreate.length > 0) {
          const inserted = await tx
            .insert(views)
            .values(
              namesToCreate.map((name) => ({
                userId: context.user.id,
                name,
                layout: DEFAULT_VIEW_LAYOUT,
                placement: viewOrder.length - 1 - viewOrder.indexOf(name),
              })),
            )
            .returning();
          for (const v of inserted) {
            viewByName.set(v.name, v);
          }
        }

        const nestedTagSectionNames = getUniqueNames(
          [...sectionOrderByViewName.values()]
            .flat()
            .filter((section) => section.type !== VIEW_LAYOUT_ITEM_TYPE.FEED)
            .map((section) => section.name),
        );
        const existingCategories =
          nestedTagSectionNames.length > 0
            ? await tx
                .select()
                .from(contentCategories)
                .where(
                  and(
                    eq(contentCategories.userId, context.user.id),
                    inArray(contentCategories.name, nestedTagSectionNames),
                  ),
                )
            : [];
        const categoryByName = new Map(
          existingCategories.map((category) => [category.name, category]),
        );
        const categoryNamesToCreate = nestedTagSectionNames.filter(
          (name) => !categoryByName.has(name),
        );

        if (categoryNamesToCreate.length > 0) {
          const insertedCategories = await tx
            .insert(contentCategories)
            .values(
              categoryNamesToCreate.map((name) => ({
                userId: context.user.id,
                name,
              })),
            )
            .returning();

          for (const category of insertedCategories) {
            categoryByName.set(category.name, category);
          }
        }

        return { viewByName, categoryByName };
      });

      // Views exist before any feed is processed — surface them right away,
      // both on the importing client (direct chunk) and on other sessions
      // (invalidation).
      yield {
        type: "import-views-updated",
        views: await loadApplicationViews(context.db, context.user.id),
      } satisfies ImportProgressChunk;
      await publishOrganizationInvalidation();
    }

    // Feeds available for view linking: newly inserted feeds plus duplicates
    // that already existed (re-importing a Serial export must still populate
    // the views).
    type LinkableFeed = {
      inputFeedUrl: string;
      feedId: number;
      feed: ApplicationFeed;
      categoryPaths: NormalizedImportCategoryPathItem[][];
    };
    const insertedFeeds: LinkableFeed[] = [];
    const existingLinkedFeeds: LinkableFeed[] = [];

    // Worker function: insert feed and link it into its imported views
    async function insertFeed(
      feedInput: (typeof feedsWithActivation)[0],
    ): Promise<ImportProgressChunk[]> {
      const chunks: ImportProgressChunk[] = [];

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Import timed out")),
          FEED_TIMEOUT_MS,
        );
      });

      const insertPromise = (async () => {
        const insertResult = await dbSemaphore.run(() =>
          context.db.transaction(async (tx) => {
            const result = await insertFeedWithCategories(
              tx,
              context.user.id,
              feedInput,
              feedInput.shouldBeActive,
            );

            const linkableFeedId = result.success
              ? result.feedId
              : result.existingFeed?.id;
            if (viewLinking && linkableFeedId) {
              const viewFeedRows: Array<{ viewId: number; feedId: number }> =
                [];
              const feedCategoryRows: Array<{
                feedId: number;
                categoryId: number;
              }> = [];

              for (const categoryPath of feedInput.categoryPaths) {
                const viewName = categoryPath[0]?.name;
                const view = viewName
                  ? viewLinking.viewByName.get(viewName)
                  : undefined;
                if (!view) continue;
                viewFeedRows.push({ viewId: view.id, feedId: linkableFeedId });

                if (categoryPath.length <= 1) continue;
                const subsectionItem = getImportedSubsectionItem(categoryPath);
                if (
                  !subsectionItem ||
                  subsectionItem.type === VIEW_LAYOUT_ITEM_TYPE.FEED
                ) {
                  continue;
                }
                const category = viewLinking.categoryByName.get(
                  subsectionItem.name,
                );
                if (category) {
                  feedCategoryRows.push({
                    feedId: linkableFeedId,
                    categoryId: category.id,
                  });
                }
              }

              if (viewFeedRows.length > 0) {
                await tx
                  .insert(viewFeeds)
                  .values(viewFeedRows)
                  .onConflictDoNothing();
              }
              if (feedCategoryRows.length > 0) {
                await tx
                  .insert(feedCategories)
                  .values(feedCategoryRows)
                  .onConflictDoNothing();
              }
            }

            return result;
          }),
        );

        if (!insertResult.success) {
          if (insertResult.existingFeed) {
            // Already-subscribed feeds are not an import failure: they have
            // been linked into the imported views above and just skip the
            // fetch phase.
            existingLinkedFeeds.push({
              inputFeedUrl: feedInput.feedUrl,
              feedId: insertResult.existingFeed.id,
              feed: insertResult.existingFeed,
              categoryPaths: feedInput.categoryPaths,
            });
            chunks.push({
              type: "feed-status",
              feedId: insertResult.existingFeed.id,
              status: "skipped",
            });
            return chunks;
          }
          chunks.push({
            type: "import-feed-error",
            feedUrl: feedInput.feedUrl,
            error: insertResult.error,
          });
          return chunks;
        }

        chunks.push({
          type: "import-feed-inserted",
          feedUrl: feedInput.feedUrl,
          feedId: insertResult.feedId,
          feed: insertResult.feed,
        });

        insertedFeeds.push({
          inputFeedUrl: feedInput.feedUrl,
          feedId: insertResult.feedId,
          feed: insertResult.feed,
          categoryPaths: feedInput.categoryPaths,
        });

        return chunks;
      })();

      try {
        return await Promise.race([insertPromise, timeoutPromise]);
      } catch (error) {
        captureException(error);
        return [
          {
            type: "import-feed-error",
            feedUrl: feedInput.feedUrl,
            error: error instanceof Error ? error.message : "Import timed out",
          },
        ];
      }
    }

    // Insert all feeds through the worker pool, surfacing view memberships
    // periodically as they land.
    let lastMembershipPublishAt = Date.now();
    for await (const chunks of workerPool(
      feedsWithActivation,
      BATCH_SIZE,
      insertFeed,
    )) {
      for (const chunk of chunks) yield chunk;
      if (
        viewLinking &&
        Date.now() - lastMembershipPublishAt >= MEMBERSHIP_PUBLISH_INTERVAL_MS
      ) {
        lastMembershipPublishAt = Date.now();
        await publishOrganizationInvalidation();
      }
    }

    // Nested folders become ordered view sections. Feed-type sections need
    // feed ids, so this pass runs after the insert pool.
    const linkableFeedsByInputUrl = new Map(
      [...insertedFeeds, ...existingLinkedFeeds].map((feed) => [
        feed.inputFeedUrl,
        feed,
      ]),
    );
    const orderedLinkableFeeds = input.feeds
      .map((feed) => linkableFeedsByInputUrl.get(feed.feedUrl))
      .filter((feed): feed is LinkableFeed => !!feed);

    if (viewLinking && orderedLinkableFeeds.length > 0) {
      const { viewByName, categoryByName } = viewLinking;
      await context.db.transaction(async (tx) => {
        const viewIds = [...viewByName.values()].map((view) => view.id);
        const existingViewSections =
          viewIds.length > 0
            ? await tx
                .select()
                .from(viewSections)
                .where(inArray(viewSections.viewId, viewIds))
                .orderBy(asc(viewSections.placement))
            : [];
        const existingSectionKeys = new Set(
          existingViewSections.map(
            (section) =>
              `${section.viewId}:${section.itemType}:${section.itemId}`,
          ),
        );
        const nextPlacementByViewId = new Map<number, number>();

        for (const section of existingViewSections) {
          const nextPlacement = Math.max(
            nextPlacementByViewId.get(section.viewId) ?? 0,
            section.placement + 1,
          );
          nextPlacementByViewId.set(section.viewId, nextPlacement);
        }

        const viewSectionRows: Array<{
          viewId: number;
          placement: number;
          itemType:
            | typeof VIEW_LAYOUT_ITEM_TYPE.TAG
            | typeof VIEW_LAYOUT_ITEM_TYPE.FEED;
          itemId: number;
        }> = [];
        const linkableFeedsByCanonicalUrl = new Map(
          orderedLinkableFeeds.map((feed) => [feed.feed.url, feed]),
        );

        function findImportedFeedSectionItem(
          section: NormalizedImportCategoryPathItem,
        ) {
          if (section.feedUrl) {
            return (
              linkableFeedsByInputUrl.get(section.feedUrl) ??
              linkableFeedsByCanonicalUrl.get(section.feedUrl) ??
              null
            );
          }

          return (
            orderedLinkableFeeds.find(
              (feed) => (feed.feed.name || feed.feed.url) === section.name,
            ) ?? null
          );
        }

        for (const linkableFeed of orderedLinkableFeeds) {
          for (const categoryPath of linkableFeed.categoryPaths) {
            const viewName = categoryPath[0]?.name;
            if (!viewName) continue;

            const view = viewByName.get(viewName);
            if (!view) continue;

            if (categoryPath.length <= 1) continue;

            const subsectionItem = getImportedSubsectionItem(categoryPath);
            if (!subsectionItem) continue;

            const viewSectionItem =
              subsectionItem.type === VIEW_LAYOUT_ITEM_TYPE.FEED
                ? {
                    itemType: VIEW_LAYOUT_ITEM_TYPE.FEED,
                    itemId:
                      findImportedFeedSectionItem(subsectionItem)?.feedId ??
                      null,
                  }
                : {
                    itemType: VIEW_LAYOUT_ITEM_TYPE.TAG,
                    itemId: categoryByName.get(subsectionItem.name)?.id ?? null,
                  };
            if (!viewSectionItem.itemId) continue;

            const sectionKey = `${view.id}:${viewSectionItem.itemType}:${viewSectionItem.itemId}`;
            if (!existingSectionKeys.has(sectionKey)) {
              const nextPlacement = nextPlacementByViewId.get(view.id) ?? 0;
              viewSectionRows.push({
                viewId: view.id,
                placement: nextPlacement,
                itemType: viewSectionItem.itemType,
                itemId: viewSectionItem.itemId,
              });
              nextPlacementByViewId.set(view.id, nextPlacement + 1);
              existingSectionKeys.add(sectionKey);
            }
          }
        }

        if (viewSectionRows.length > 0) {
          await tx.insert(viewSections).values(viewSectionRows);
        }
      });

      // Memberships and sections are complete before the slow fetch phase.
      yield {
        type: "import-views-updated",
        views: await loadApplicationViews(context.db, context.user.id),
      } satisfies ImportProgressChunk;
      await publishOrganizationInvalidation();
    }

    // Fetch RSS content for the newly inserted feeds through the worker pool.
    async function fetchInsertedFeed(
      insertedFeed: LinkableFeed,
    ): Promise<ImportProgressChunk[]> {
      const chunks: ImportProgressChunk[] = [];

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Import timed out")),
          FEED_TIMEOUT_MS,
        );
      });

      const fetchPromise = (async () => {
        for await (const feedResult of fetchAndInsertFeedData(context, [
          insertedFeed.feed,
        ])) {
          chunks.push({
            type: "feed-status",
            feedId: feedResult.id,
            status: feedResult.status,
          });
        }
        return chunks;
      })();

      try {
        return await Promise.race([fetchPromise, timeoutPromise]);
      } catch (error) {
        captureException(error);
        return [
          {
            type: "feed-status",
            feedId: insertedFeed.feedId,
            status: "error",
          },
        ];
      }
    }

    for await (const chunks of workerPool(
      insertedFeeds,
      BATCH_SIZE,
      fetchInsertedFeed,
    )) {
      for (const chunk of chunks) yield chunk;
    }

    await publishOrganizationInvalidation();
  });

/**
 * Fetch fulltext content for a list of items.
 * Used by the client after receiving lightweight items to fill in missing content.
 * Returns requested content directly to the initiating client.
 */
export const requestFullTextForItems = protectedProcedure
  .input(
    z.object({
      itemIds: z.array(z.string()).max(500),
    }),
  )
  .handler(async ({ context, input }) => {
    try {
      const items = await context.db
        .select({
          id: feedItems.id,
          content: feedItems.content,
          contentSnippet: feedItems.contentSnippet,
        })
        .from(feedItems)
        .innerJoin(feeds, eq(feedItems.feedId, feeds.id))
        .where(
          and(
            inArray(feedItems.id, input.itemIds),
            eq(feeds.userId, context.user.id),
          ),
        );

      return items;
    } catch (error) {
      captureException(error);
      throw error;
    }
  });
