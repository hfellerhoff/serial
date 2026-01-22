import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  GET_BY_VIEW_CHUNK_SIZE,
  INITIAL_ITEMS_PER_VIEW,
  ITEMS_BY_VISIBILITY_CHUNK_SIZE,
  ITEMS_PER_PAGE,
  REVALIDATE_VIEW_CHUNK_SIZE,
} from "../constants";
import { publisher } from "../publisher";
import { insertFeedWithCategories } from "./feed-router/utils";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type {
  ApplicationFeed,
  ApplicationFeedItem,
  ApplicationView,
  DatabaseContentCategory,
  DatabaseFeed,
  DatabaseFeedCategory,
  DatabaseView,
  DatabaseViewCategory,
} from "~/server/db/schema";
import type { ORPCContext } from "~/server/orpc/base";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import { visibilityFilterSchema } from "~/lib/data/atoms";
import {
  buildContentTypeFilter,
  buildTimeWindowFilter,
  buildViewCategoryFilter,
  buildVisibilityFilter,
  isFeedCompatibleWithContentType,
} from "~/lib/data/feed-items/filters";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import { sortViewsByPlacement } from "~/lib/data/views/utils";
import { prepareArrayChunks } from "~/lib/iterators";
import { buildUncategorizedView } from "~/server/api/utils/buildUncategorizedView";

import { parseArrayOfSchema } from "~/lib/schemas/utils";
import { workerPool } from "~/lib/workerPool";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  feedsSchema,
  viewCategories,
  views,
} from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";

export type PaginationCursor = { postedAt: Date; id: string } | null;

export type ViewDataChunk =
  | {
      type: "feed-items";
      viewId?: number;
      feedId?: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter?: string;
      hasMore?: boolean;
      nextCursor?: PaginationCursor;
    }
  | { type: "error"; message: string; phase: string; viewId: number };

export type GetByViewChunk =
  | { type: "views"; views: ApplicationView[] }
  | { type: "feeds"; feeds: ApplicationFeed[] }
  | { type: "feed-categories"; feedCategories: DatabaseFeedCategory[] }
  | { type: "content-categories"; contentCategories: DatabaseContentCategory[] }
  | { type: "feed-status"; feedId: number; status: FetchFeedsStatus }
  | { type: "view-feeds"; viewId: number; feedIds: number[] }
  | { type: "initial-data-complete" }
  | { type: "new-data-complete" }
  | { type: "refresh-start"; totalFeeds: number }
  | { type: "view-items"; viewId: number; feedItemIds: string[] }
  | {
      type: "import-feed-inserted";
      feedUrl: string;
      feedId: number;
      feed: ApplicationFeed;
    }
  | { type: "import-feed-error"; feedUrl: string; error: string }
  | { type: "import-start"; totalFeeds: number }
  | ViewDataChunk;

export type RevalidateViewChunk =
  | { type: "views"; views: ApplicationView[] }
  | {
      type: "feed-items";
      viewId: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter?: string;
      hasMore?: boolean;
      nextCursor?: PaginationCursor;
    }
  | { type: "view-feeds"; viewId: number; feedIds: number[] }
  | { type: "error"; message: string; phase: string };

/**
 * Compute which feeds belong to a view based on categories and content type.
 * This replicates client-side logic from useCheckFeedBelongsToView.
 */
function computeFeedsForView(
  view: ApplicationView,
  allFeeds: ApplicationFeed[],
  allFeedCategories: DatabaseFeedCategory[],
  customViews: ApplicationView[],
  customViewCategoryIds: Set<number>,
): number[] {
  const feedIds: number[] = [];

  for (const feed of allFeeds) {
    // Check if feed's content type is compatible with the view
    const isCompatible = isFeedCompatibleWithContentType(
      feed.platform,
      view.contentType,
    );
    if (!isCompatible) {
      continue;
    }

    // Get categories this feed belongs to
    const feedCategoryIds = allFeedCategories
      .filter((fc) => fc.feedId === feed.id)
      .map((fc) => fc.categoryId);

    // For Uncategorized view, include feeds that are NOT in any custom view category
    // or feeds that are in the Uncategorized view's category list
    if (view.id === INBOX_VIEW_ID) {
      // Check if feed has any category that's in a custom view with compatible content type
      const wouldAppearInCustomView = feedCategoryIds.some((categoryId) => {
        if (!customViewCategoryIds.has(categoryId)) return false;

        const viewsWithCategory = customViews.filter((v) =>
          v.categoryIds.includes(categoryId),
        );

        return viewsWithCategory.some((v) =>
          isFeedCompatibleWithContentType(feed.platform, v.contentType),
        );
      });

      // Feed belongs to Uncategorized if it wouldn't appear in any custom view
      // OR if it has no categories at all
      if (!wouldAppearInCustomView) {
        feedIds.push(feed.id);
        continue;
      }

      // Also check if feed's categories overlap with Uncategorized view's categoryIds
      if (
        feedCategoryIds.some((categoryId) =>
          view.categoryIds.includes(categoryId),
        )
      ) {
        feedIds.push(feed.id);
        continue;
      }
    } else {
      // Empty categoryIds means "all categories" (no category filter)
      if (view.categoryIds.length === 0) {
        feedIds.push(feed.id);
      } else {
        // For views with specific categories, check if any of the feed's categories are in the view
        const categoryMatch = feedCategoryIds.some((categoryId) =>
          view.categoryIds.includes(categoryId),
        );

        if (categoryMatch) {
          feedIds.push(feed.id);
        }
      }
    }
  }

  return feedIds;
}

interface FetchContentForViewParams {
  feedIds: number[];
  visibilityFilter: VisibilityFilter | undefined;
  feedCategoriesList: any;
  customViewCategoryIds: any;
  customViews: any;
  applicationFeeds: any;
  feedsById: any;
}

async function fetchContentForView(
  context: ORPCContext,
  view: ApplicationView,
  {
    feedIds,
    visibilityFilter,
    feedCategoriesList,
    customViewCategoryIds,
    customViews,
    applicationFeeds,
    feedsById,
  }: FetchContentForViewParams,
): Promise<ViewDataChunk> {
  visibilityFilter ??= "unread";

  try {
    const filterConditions = [
      inArray(feedItems.feedId, feedIds),
      buildVisibilityFilter(visibilityFilter),
      buildViewCategoryFilter(
        view,
        feedCategoriesList,
        feedIds,
        customViewCategoryIds,
        customViews,
        applicationFeeds,
      ),
      buildContentTypeFilter(view.contentType, applicationFeeds),
      buildTimeWindowFilter(view.daysWindow),
    ].filter(Boolean);

    const filter =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const initialItems = await context.db.query.feedItems.findMany({
      where: filter,
      orderBy: desc(feedItems.postedAt),
      limit: INITIAL_ITEMS_PER_VIEW,
    });

    if (initialItems.length > 0) {
      const applicationItems = initialItems.map((item) => {
        const itemFeed = feedsById.get(item.feedId);
        return {
          ...item,
          platform: itemFeed?.platform ?? "youtube",
        } as ApplicationFeedItem;
      });

      return {
        type: "feed-items",
        viewId: view.id,
        feedItems: applicationItems,
        visibilityFilter: visibilityFilter,
      };
    }
  } catch (error) {
    return {
      type: "error",
      message:
        error instanceof Error
          ? error.message
          : `Failed to fetch initial items for view ${view.id}`,
      phase: "initial-items",
      viewId: view.id,
    };
    // Continue to next view instead of stopping
  }

  return {
    type: "feed-items",
    viewId: view.id,
    feedItems: [],
    visibilityFilter: visibilityFilter,
  };
}

async function* fetchContentForViews(
  context: ORPCContext,
  viewList: ApplicationView[],
  params: FetchContentForViewParams,
) {
  const viewIds = viewList.map((view) => view.id);
  const viewPromises = viewList.map((view) =>
    fetchContentForView(context, view, params),
  );

  while (viewPromises.length > 0) {
    const result = await Promise.any(Array.from(viewPromises));

    const resultIndex = viewIds.findIndex((id) => id === result.viewId);
    void viewPromises.splice(resultIndex, 1);
    viewIds.splice(resultIndex, 1);

    yield result;
  }

  return;
}

// Helper to get the user's channel name
function getUserChannel(userId: string): string {
  return `user:${userId}`;
}

// ============================================================================
// PREREQUISITE DATA HELPERS
// ============================================================================

type PrerequisiteData = {
  viewsList: DatabaseView[];
  feedsList: DatabaseFeed[];
  contentCategoriesList: DatabaseContentCategory[];
  feedCategoriesList: DatabaseFeedCategory[];
  viewCategoriesList: DatabaseViewCategory[];
};

/**
 * Fetch all prerequisite data needed for view-based queries.
 * Fetches views, feeds, content categories, feed categories, and view categories
 * in parallel batches for optimal performance.
 *
 * Note: This helper should only be called from protected procedures where user is guaranteed to exist.
 */
async function fetchUserPrerequisiteData(
  context: ORPCContext,
): Promise<PrerequisiteData> {
  const userId = context.user!.id;

  // First batch: views, feeds, content categories (no dependencies)
  const [viewsList, feedsList, contentCategoriesList] = await Promise.all([
    context.db
      .select()
      .from(views)
      .where(eq(views.userId, userId))
      .orderBy(asc(views.placement)),
    context.db.query.feeds.findMany({
      where: eq(feeds.userId, userId),
    }),
    context.db
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, userId))
      .orderBy(asc(contentCategories.name)),
  ]);

  // Second batch: feed categories and view categories (depend on first batch)
  const userContentCategoryIds = contentCategoriesList.map((cc) => cc.id);
  const userViewIds = viewsList.map((v) => v.id);

  const [feedCategoriesList, viewCategoriesList] = await Promise.all([
    userContentCategoryIds.length > 0
      ? context.db
          .select()
          .from(feedCategories)
          .where(inArray(feedCategories.categoryId, userContentCategoryIds))
      : Promise.resolve([]),
    userViewIds.length > 0
      ? context.db
          .select()
          .from(viewCategories)
          .where(inArray(viewCategories.viewId, userViewIds))
      : Promise.resolve([]),
  ]);

  return {
    viewsList,
    feedsList,
    contentCategoriesList,
    feedCategoriesList,
    viewCategoriesList,
  };
}

type ApplicationViewsData = {
  customViews: ApplicationView[];
  allViews: ApplicationView[];
  customViewCategoryIds: Set<number>;
};

/**
 * Build ApplicationView objects from raw database data.
 * Includes creating the Uncategorized view and sorting by placement.
 */
function buildApplicationViews(
  userId: string,
  viewsList: PrerequisiteData["viewsList"],
  contentCategoriesList: PrerequisiteData["contentCategoriesList"],
  viewCategoriesList: PrerequisiteData["viewCategoriesList"],
): ApplicationViewsData {
  // Transform database views to ApplicationView with categoryIds
  const customViews: ApplicationView[] = viewsList.map((view) => ({
    ...view,
    isDefault: false,
    categoryIds: viewCategoriesList
      .filter((vc) => vc.viewId === view.id)
      .map((vc) => vc.categoryId)
      .filter((id): id is number => id !== null),
  }));

  // Build the Uncategorized view
  const uncategorizedView = buildUncategorizedView(
    userId,
    contentCategoriesList,
    customViews,
  );

  // Combine and sort all views
  const allViews = sortViewsByPlacement([...customViews, uncategorizedView]);

  // Collect all category IDs used by custom views (for Uncategorized view exclusion)
  const customViewCategoryIds = new Set(
    customViews.flatMap((v) => v.categoryIds),
  );

  return { customViews, allViews, customViewCategoryIds };
}

// ============================================================================
// SHARED HELPER FUNCTIONS
// ============================================================================

type PaginationResult<T> = {
  itemsToReturn: T[];
  hasMore: boolean;
  nextCursor: PaginationCursor;
};

/**
 * Process pagination results: determine hasMore, slice items, create nextCursor.
 * Pass itemsData from a query that fetched limit + 1 items.
 */
function processPaginationResults<T extends { postedAt: Date; id: string }>(
  itemsData: T[],
  limit: number,
): PaginationResult<T> {
  const hasMore = itemsData.length > limit;
  const itemsToReturn = hasMore ? itemsData.slice(0, limit) : itemsData;

  const lastItem = itemsToReturn[itemsToReturn.length - 1];
  const nextCursor: PaginationCursor =
    hasMore && lastItem
      ? { postedAt: lastItem.postedAt, id: lastItem.id }
      : null;

  return { itemsToReturn, hasMore, nextCursor };
}

/**
 * Map database feed items to ApplicationFeedItem with platform lookup.
 */
function mapToApplicationFeedItems(
  items: Array<{ feedId: number; postedAt: Date; id: string }>,
  feedsById: Map<number, DatabaseFeed>,
): ApplicationFeedItem[] {
  return items.map((item) => {
    const itemFeed = feedsById.get(item.feedId);
    return {
      ...item,
      platform: itemFeed?.platform ?? "youtube",
    } as ApplicationFeedItem;
  });
}

type PreparedApplicationData = {
  customViews: ApplicationView[];
  allViews: ApplicationView[];
  customViewCategoryIds: Set<number>;
  applicationFeeds: ApplicationFeed[];
  feedsById: Map<number, DatabaseFeed>;
  feedIds: number[];
};

/**
 * Prepare application data after fetching prerequisites.
 * Builds application views, parses feeds, creates feedsById map.
 */
function prepareApplicationData(
  userId: string,
  prerequisiteData: PrerequisiteData,
): PreparedApplicationData {
  const { viewsList, feedsList, contentCategoriesList, viewCategoriesList } =
    prerequisiteData;

  const { customViews, allViews, customViewCategoryIds } =
    buildApplicationViews(
      userId,
      viewsList,
      contentCategoriesList,
      viewCategoriesList,
    );

  const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);
  const feedsById = new Map(feedsList.map((f) => [f.id, f]));
  const feedIds = feedsList.map((feed) => feed.id);

  return {
    customViews,
    allViews,
    customViewCategoryIds,
    applicationFeeds,
    feedsById,
    feedIds,
  };
}

/**
 * Publish prerequisite data chunks (views, feeds, content-categories, feed-categories).
 */
async function publishPrerequisiteDataChunks(
  channel: string,
  source: "initial" | "new-data",
  data: {
    allViews: ApplicationView[];
    applicationFeeds: ApplicationFeed[];
    contentCategoriesList: DatabaseContentCategory[];
    feedCategoriesList: DatabaseFeedCategory[];
  },
): Promise<void> {
  await publisher.publish(channel, {
    source,
    chunk: { type: "views", views: data.allViews },
  });

  await publisher.publish(channel, {
    source,
    chunk: { type: "feeds", feeds: data.applicationFeeds },
  });

  await publisher.publish(channel, {
    source,
    chunk: {
      type: "content-categories",
      contentCategories: data.contentCategoriesList,
    },
  });

  await publisher.publish(channel, {
    source,
    chunk: { type: "feed-categories", feedCategories: data.feedCategoriesList },
  });
}

/**
 * Build a reverse mapping of feedId → viewIds for RSS item routing.
 */
function buildFeedIdToViewIdsMap(
  allViews: ApplicationView[],
  applicationFeeds: ApplicationFeed[],
  feedCategoriesList: DatabaseFeedCategory[],
  customViews: ApplicationView[],
  customViewCategoryIds: Set<number>,
): Map<number, number[]> {
  const feedIdToViewIds = new Map<number, number[]>();

  for (const view of allViews) {
    const feedIdsForView = computeFeedsForView(
      view,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
    );

    for (const feedId of feedIdsForView) {
      const existingViewIds = feedIdToViewIds.get(feedId) ?? [];
      feedIdToViewIds.set(feedId, [...existingViewIds, view.id]);
    }
  }

  return feedIdToViewIds;
}

type PublishViewFeedsResult = {
  feedIdToViewIds?: Map<number, number[]>;
};

/**
 * Publish view-feeds chunks for all views.
 * Optionally builds and returns feedIdToViewIds map.
 */
async function publishViewFeedsChunks(
  channel: string,
  source: "initial" | "new-data",
  params: {
    allViews: ApplicationView[];
    applicationFeeds: ApplicationFeed[];
    feedCategoriesList: DatabaseFeedCategory[];
    customViews: ApplicationView[];
    customViewCategoryIds: Set<number>;
    buildFeedIdToViewIds?: boolean;
  },
): Promise<PublishViewFeedsResult> {
  const {
    allViews,
    applicationFeeds,
    feedCategoriesList,
    customViews,
    customViewCategoryIds,
    buildFeedIdToViewIds,
  } = params;

  const feedIdToViewIds = buildFeedIdToViewIds
    ? new Map<number, number[]>()
    : undefined;

  for (const view of allViews) {
    const feedIdsForView = computeFeedsForView(
      view,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
    );

    await publisher.publish(channel, {
      source,
      chunk: {
        type: "view-feeds",
        viewId: view.id,
        feedIds: feedIdsForView,
      },
    });

    if (feedIdToViewIds) {
      for (const feedId of feedIdsForView) {
        const existingViewIds = feedIdToViewIds.get(feedId) ?? [];
        feedIdToViewIds.set(feedId, [...existingViewIds, view.id]);
      }
    }
  }

  return { feedIdToViewIds };
}

// ============================================================================
// SUBSCRIPTION PROCEDURE
// ============================================================================

/**
 * Subscribe to the user's channel to receive real-time data chunks.
 * This creates a long-lived SSE connection.
 */
export const subscribe = protectedProcedure.handler(async function* ({
  context,
  signal,
  lastEventId,
}) {
  const channel = getUserChannel(context.user.id);
  const iterator = publisher.subscribe(channel, { signal, lastEventId });

  for await (const payload of iterator) {
    yield payload;
  }
});

// ============================================================================
// REQUEST PROCEDURES (publish instead of yield)
// ============================================================================

/**
 * Request initial data load. Data is published to the user's channel.
 */
export const requestInitialData = protectedProcedure
  .input(z.object({ visibilityFilter: visibilityFilterSchema }).optional())
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const visibilityFilter = input?.visibilityFilter;
    const isVisibilityFilterFetch = !!visibilityFilter;

    // Step 1: Fetch all prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch initial data",
          phase: "initial-fetch",
          viewId: -1,
        },
      });
      return { status: "error" };
    }

    const { feedsList, contentCategoriesList, feedCategoriesList } =
      prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    // Step 2: Publish prerequisite data chunks (skip when fetching for visibility filter)
    if (!isVisibilityFilterFetch) {
      await publishPrerequisiteDataChunks(channel, "initial", {
        allViews,
        applicationFeeds,
        contentCategoriesList,
        feedCategoriesList,
      });

      // Step 3: Publish view-feeds chunks for each view
      await publishViewFeedsChunks(channel, "initial", {
        allViews,
        applicationFeeds,
        feedCategoriesList,
        customViews,
        customViewCategoryIds,
      });
    }

    const firstView = allViews[0];

    if (feedIds.length === 0 || !firstView) {
      if (!isVisibilityFilterFetch) {
        await publisher.publish(channel, {
          source: "initial",
          chunk: { type: "initial-data-complete" },
        });
      }
      return { status: "completed" };
    }

    const fetchContentForViewParams: FetchContentForViewParams = {
      feedIds,
      visibilityFilter,
      feedCategoriesList,
      customViewCategoryIds,
      customViews,
      applicationFeeds,
      feedsById,
    };

    // Step 4: Query and publish initial items (first 100) for EACH view
    for await (const viewResult of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: viewResult,
      });
    }

    // Skip initial-data-complete and RSS fetch when fetching for visibility filter
    if (!isVisibilityFilterFetch) {
      // Signal that initial data is complete - client can hide loading screen
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "initial-data-complete" },
      });

      // Step 5: Run fetch and insert for fresh RSS items in background
      // Items are inserted to DB by fetchAndInsertFeedData - don't publish them here
      // Fresh items will be available via pagination (getItemsByVisibility)
      for await (const feedResult of fetchAndInsertFeedData(
        context,
        feedsList,
      )) {
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "feed-status",
            status: feedResult.status,
            feedId: feedResult.id,
          },
        });
        // Items already inserted to DB - they'll be included in pagination queries
      }
    }

    return { status: "completed" };
  });

/**
 * Request data after importing feeds. Similar to requestInitialData but also
 * streams ALL RSS-fetched items to the client for immediate display.
 * Only fetches RSS for the specified newFeedIds (the newly imported feeds).
 */
export const requestImportedData = protectedProcedure
  .input(z.object({ newFeedIds: z.number().array() }))
  .handler(async ({ context, input }) => {
    const { newFeedIds } = input;
    const channel = getUserChannel(context.user.id);

    // Step 1: Fetch all prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch initial data",
          phase: "initial-fetch",
          viewId: -1,
        },
      });
      return { status: "error" };
    }

    const { feedsList, contentCategoriesList, feedCategoriesList } =
      prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    // Step 2: Publish prerequisite data chunks
    await publishPrerequisiteDataChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      contentCategoriesList,
      feedCategoriesList,
    });

    // Step 3: Publish view-feeds chunks and build feedIdToViewIds mapping
    const result = await publishViewFeedsChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
      buildFeedIdToViewIds: true,
    });
    // feedIdToViewIds is guaranteed to be defined when buildFeedIdToViewIds is true
    const feedIdToViewIds = result.feedIdToViewIds!;

    const firstView = allViews[0];

    if (feedIds.length === 0 || !firstView) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "initial-data-complete" },
      });
      return { status: "completed" };
    }

    const fetchContentForViewParams: FetchContentForViewParams = {
      feedIds,
      visibilityFilter: undefined,
      feedCategoriesList,
      customViewCategoryIds,
      customViews,
      applicationFeeds,
      feedsById,
    };

    // Step 4: Query and publish initial items for EACH view
    for await (const viewResult of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: viewResult,
      });
    }

    // Signal that initial data is complete - client can hide loading screen
    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "initial-data-complete" },
    });

    // Step 5: Run fetch and insert for fresh RSS items - ONLY for newly imported feeds
    // Filter feedsList to only include the newly imported feeds
    const newFeedsToFetch = feedsList.filter((feed) =>
      newFeedIds.includes(feed.id),
    );

    for await (const feedResult of fetchAndInsertFeedData(
      context,
      newFeedsToFetch,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "feed-status",
          status: feedResult.status,
          feedId: feedResult.id,
        },
      });

      // Stream ALL fetched items (unlike requestInitialData which only sends feed-status)
      if (feedResult.status === "success" && feedResult.feedItems.length > 0) {
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "feed-items",
            feedId: feedResult.id,
            feedItems: feedResult.feedItems,
          },
        });

        // Stream view mappings for the items
        const viewIdsForFeed = feedIdToViewIds.get(feedResult.id) ?? [];
        const itemIds = feedResult.feedItems.map((item) => item.id);
        for (const viewId of viewIdsForFeed) {
          await publisher.publish(channel, {
            source: "initial",
            chunk: {
              type: "view-items",
              viewId,
              feedItemIds: itemIds,
            },
          });
        }
      }
    }

    return { status: "completed" };
  });

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
          categories: z.string().array(),
        })
        .array(),
    }),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const BATCH_SIZE = 64;

    if (!input.feeds.length) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "initial-data-complete" },
      });
      return { status: "completed" };
    }

    // Publish import start with total feeds count
    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "import-start", totalFeeds: input.feeds.length },
    });

    // Track successful feed IDs for building view mappings later
    const successfulFeeds: Array<{
      feedId: number;
      feed: typeof feeds.$inferSelect;
    }> = [];

    // Worker function: insert feed + fetch RSS content
    async function processFeed(feedInput: (typeof input.feeds)[0]) {
      // 1. Insert feed within a transaction
      const insertResult = await context.db.transaction(async (tx) => {
        return await insertFeedWithCategories(tx, context.user.id, feedInput);
      });

      if (!insertResult.success) {
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "import-feed-error",
            feedUrl: feedInput.feedUrl,
            error: insertResult.error,
          },
        });
        return { success: false as const, feedUrl: feedInput.feedUrl };
      }

      // 2. Publish that feed was inserted
      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "import-feed-inserted",
          feedUrl: feedInput.feedUrl,
          feedId: insertResult.feedId,
          feed: insertResult.feed,
        },
      });

      // Track successful feed for later
      successfulFeeds.push({
        feedId: insertResult.feedId,
        feed: insertResult.feed as typeof feeds.$inferSelect,
      });

      // 3. Immediately fetch RSS content for this feed
      for await (const feedResult of fetchAndInsertFeedData(context, [
        insertResult.feed as typeof feeds.$inferSelect,
      ])) {
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "feed-status",
            feedId: feedResult.id,
            status: feedResult.status,
          },
        });
      }

      return {
        success: true as const,
        feedUrl: feedInput.feedUrl,
        feedId: insertResult.feedId,
      };
    }

    // Process all feeds through worker pool
    const workerIterator = workerPool(input.feeds, BATCH_SIZE, processFeed);
    // Consume the iterator - results are published via side effects in processFeed
    while (!(await workerIterator.next()).done) {
      // Results stream as each feed completes
    }

    // After all feeds complete, publish updated prerequisite data
    const prerequisiteData = await fetchUserPrerequisiteData(context);
    const { contentCategoriesList, feedCategoriesList } = prerequisiteData;

    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    await publishPrerequisiteDataChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      contentCategoriesList,
      feedCategoriesList,
    });

    // Publish view-feeds chunks
    await publishViewFeedsChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
    });

    // Query and publish items for all views (like requestInitialData)
    const fetchContentForViewParams: FetchContentForViewParams = {
      feedIds,
      visibilityFilter: undefined,
      feedCategoriesList,
      customViewCategoryIds,
      customViews,
      applicationFeeds,
      feedsById,
    };

    for await (const viewResult of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: viewResult,
      });
    }

    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "initial-data-complete" },
    });

    return { status: "completed" };
  });

/**
 * Request new data (refresh). Only performs RSS fetching and returns items
 * newer than the client-provided timestamp.
 */
export const requestNewData = protectedProcedure
  .input(z.object({ newerThan: z.coerce.date() }))
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const newerThanTimestamp = input.newerThan;

    // Fetch prerequisite data (needed for feedIdToViewIds mapping)
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      await publisher.publish(channel, {
        source: "new-data",
        chunk: {
          type: "error",
          message:
            error instanceof Error ? error.message : "Failed to fetch data",
          phase: "initial-fetch",
          viewId: -1,
        },
      });
      return { status: "error" };
    }

    const { feedsList, feedCategoriesList } = prerequisiteData;

    // Publish total feeds count for progress tracking
    await publisher.publish(channel, {
      source: "new-data",
      chunk: { type: "refresh-start", totalFeeds: feedsList.length },
    });

    if (feedsList.length === 0) {
      await publisher.publish(channel, {
        source: "new-data",
        chunk: { type: "new-data-complete" },
      });
      return { status: "completed" };
    }

    // Build application data and feedIdToViewIds map
    const { customViews, allViews, customViewCategoryIds, applicationFeeds } =
      prepareApplicationData(context.user.id, prerequisiteData);

    const feedIdToViewIds = buildFeedIdToViewIdsMap(
      allViews,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
    );

    // Run RSS fetch and publish new items
    for await (const feedResult of fetchAndInsertFeedData(context, feedsList)) {
      // Always publish feed status (for progress tracking)
      await publisher.publish(channel, {
        source: "new-data",
        chunk: {
          type: "feed-status",
          status: feedResult.status,
          feedId: feedResult.id,
        },
      });

      if (feedResult.status === "success" && feedResult.feedItems.length > 0) {
        // Filter items newer than the client-provided timestamp
        const newItems = feedResult.feedItems.filter(
          (item) => item.postedAt > newerThanTimestamp,
        );

        if (newItems.length > 0) {
          // Stream feed items once per feed (not per view)
          await publisher.publish(channel, {
            source: "new-data",
            chunk: {
              type: "feed-items",
              feedId: feedResult.id,
              feedItems: newItems,
            },
          });

          // Stream only item IDs for each view (efficient mapping)
          const viewIdsForFeed = feedIdToViewIds.get(feedResult.id) ?? [];
          const newItemIds = newItems.map((item) => item.id);

          for (const viewId of viewIdsForFeed) {
            await publisher.publish(channel, {
              source: "new-data",
              chunk: {
                type: "view-items",
                viewId,
                feedItemIds: newItemIds,
              },
            });
          }
        }
      }
    }

    await publisher.publish(channel, {
      source: "new-data",
      chunk: { type: "new-data-complete" },
    });

    return { status: "completed" };
  });

/**
 * Cursor schema for pagination
 */
const cursorSchema = z
  .object({
    postedAt: z.coerce.date(),
    id: z.string(),
  })
  .nullable();

/**
 * Build cursor condition for pagination
 * Uses composite cursor {postedAt, id} for stable pagination
 */
function buildCursorCondition(cursor: { postedAt: Date; id: string } | null) {
  if (!cursor) return undefined;

  // WHERE (postedAt < cursor.postedAt) OR (postedAt = cursor.postedAt AND id < cursor.id)
  return or(
    lt(feedItems.postedAt, cursor.postedAt),
    and(eq(feedItems.postedAt, cursor.postedAt), lt(feedItems.id, cursor.id)),
  );
}

/**
 * Request items for a specific visibility filter with cursor-based pagination.
 * Used for lazy loading "read" and "later" visibility filters,
 * and for infinite scroll pagination.
 */
export const requestItemsByVisibility = protectedProcedure
  .input(
    z.object({
      viewId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Fetch prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to fetch initial data",
          phase: "initial-fetch",
        },
      });
      return { status: "error" };
    }

    const { feedCategoriesList } = prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    if (feedIds.length === 0) {
      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "feed-items",
          viewId: input.viewId,
          feedItems: [],
          visibilityFilter: input.visibilityFilter,
          hasMore: false,
          nextCursor: null,
        },
      });
      return { status: "completed" };
    }

    // Find target view (INBOX_VIEW_ID maps to the Uncategorized view)
    const targetView = allViews.find((v) => v.id === input.viewId);

    if (!targetView) {
      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "error",
          message: `View with ID ${input.viewId} not found`,
          phase: "find-view",
        },
      });
      return { status: "error" };
    }

    try {
      // Build filter conditions
      const filterConditions = [
        inArray(feedItems.feedId, feedIds),
        buildVisibilityFilter(input.visibilityFilter),
        buildViewCategoryFilter(
          targetView,
          feedCategoriesList,
          feedIds,
          customViewCategoryIds,
          customViews,
          applicationFeeds,
        ),
        buildContentTypeFilter(targetView.contentType, applicationFeeds),
        buildTimeWindowFilter(targetView.daysWindow),
        buildCursorCondition(input.cursor ?? null),
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const filter =
        filterConditions.length > 0 ? and(...filterConditions) : undefined;

      // Query limit + 1 to determine if there are more items
      const itemsData = await context.db.query.feedItems.findMany({
        where: filter,
        orderBy: desc(feedItems.postedAt),
        limit: limit + 1,
      });

      // Process pagination results using helper
      const { itemsToReturn, hasMore, nextCursor } = processPaginationResults(
        itemsData,
        limit,
      );

      // Map to application feed items using helper
      const applicationFeedItems = mapToApplicationFeedItems(
        itemsToReturn,
        feedsById,
      );

      // Publish items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        ITEMS_BY_VISIBILITY_CHUNK_SIZE,
      )) {
        await publisher.publish(channel, {
          source: "visibility",
          chunk: {
            type: "feed-items",
            viewId: input.viewId,
            feedItems: chunk,
            visibilityFilter: input.visibilityFilter,
            hasMore,
            nextCursor,
          },
        });
      }

      // If no items, still publish an empty response
      if (applicationFeedItems.length === 0) {
        await publisher.publish(channel, {
          source: "visibility",
          chunk: {
            type: "feed-items",
            viewId: input.viewId,
            feedItems: [],
            visibilityFilter: input.visibilityFilter,
            hasMore: false,
            nextCursor: null,
          },
        });
      }
    } catch (error) {
      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to fetch items for view ${input.viewId}`,
          phase: "feed-items",
        },
      });
      return { status: "error" };
    }

    return { status: "completed" };
  });

/**
 * Request items for a specific feed with cursor-based pagination.
 * Used for lazy loading when a feed is selected in the sidebar.
 */
export const requestItemsByFeed = protectedProcedure
  .input(
    z.object({
      feedId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Verify feed belongs to user
    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      await publisher.publish(channel, {
        source: "feed",
        chunk: {
          type: "error",
          message: `Feed with ID ${input.feedId} not found or does not belong to user`,
          phase: "verify-feed",
        },
      });
      return { status: "error" };
    }

    try {
      // Build filter conditions
      const filterConditions = [
        eq(feedItems.feedId, input.feedId),
        buildVisibilityFilter(input.visibilityFilter),
        buildCursorCondition(input.cursor ?? null),
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const filter =
        filterConditions.length > 0 ? and(...filterConditions) : undefined;

      // Query limit + 1 to determine if there are more items
      const itemsData = await context.db.query.feedItems.findMany({
        where: filter,
        orderBy: desc(feedItems.postedAt),
        limit: limit + 1,
      });

      // Process pagination results using helper
      const { itemsToReturn, hasMore, nextCursor } = processPaginationResults(
        itemsData,
        limit,
      );

      // Map items with single feed's platform (no lookup needed)
      const applicationFeedItems = itemsToReturn.map((item) => ({
        ...item,
        platform: feed.platform,
      })) as ApplicationFeedItem[];

      // Publish items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        GET_BY_VIEW_CHUNK_SIZE,
      )) {
        await publisher.publish(channel, {
          source: "feed",
          chunk: {
            type: "feed-items",
            feedId: input.feedId,
            feedItems: chunk,
            visibilityFilter: input.visibilityFilter,
            hasMore,
            nextCursor,
          },
        });
      }

      // If no items, still publish an empty response
      if (applicationFeedItems.length === 0) {
        await publisher.publish(channel, {
          source: "feed",
          chunk: {
            type: "feed-items",
            feedId: input.feedId,
            feedItems: [],
            visibilityFilter: input.visibilityFilter,
            hasMore: false,
            nextCursor: null,
          },
        });
      }
    } catch (error) {
      await publisher.publish(channel, {
        source: "feed",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to fetch items for feed ${input.feedId}`,
          phase: "feed-items",
        },
      });
      return { status: "error" };
    }

    return { status: "completed" };
  });

/**
 * Request items for feeds in a specific category with cursor-based pagination.
 * Used for lazy loading when a category is selected in the sidebar.
 */
export const requestItemsByCategoryId = protectedProcedure
  .input(
    z.object({
      categoryId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Verify category belongs to user
    const category = await context.db.query.contentCategories.findFirst({
      where: and(
        eq(contentCategories.id, input.categoryId),
        eq(contentCategories.userId, context.user.id),
      ),
    });

    if (!category) {
      await publisher.publish(channel, {
        source: "category",
        chunk: {
          type: "error",
          message: `Category with ID ${input.categoryId} not found or does not belong to user`,
          phase: "verify-category",
        },
      });
      return { status: "error" };
    }

    // Get feed IDs in this category
    const categoryFeedLinks = await context.db
      .select()
      .from(feedCategories)
      .where(eq(feedCategories.categoryId, input.categoryId));

    const feedIdsInCategory = categoryFeedLinks.map((fc) => fc.feedId);

    if (feedIdsInCategory.length === 0) {
      await publisher.publish(channel, {
        source: "category",
        chunk: {
          type: "feed-items",
          categoryId: input.categoryId,
          feedItems: [],
          visibilityFilter: input.visibilityFilter,
          hasMore: false,
          nextCursor: null,
        },
      });
      return { status: "completed" };
    }

    // Fetch feeds for platform lookup
    const feedsList = await context.db.query.feeds.findMany({
      where: and(
        inArray(feeds.id, feedIdsInCategory),
        eq(feeds.userId, context.user.id),
      ),
    });

    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    try {
      // Build filter conditions
      const filterConditions = [
        inArray(feedItems.feedId, feedIdsInCategory),
        buildVisibilityFilter(input.visibilityFilter),
        buildCursorCondition(input.cursor ?? null),
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const filter =
        filterConditions.length > 0 ? and(...filterConditions) : undefined;

      // Query limit + 1 to determine if there are more items
      const itemsData = await context.db.query.feedItems.findMany({
        where: filter,
        orderBy: desc(feedItems.postedAt),
        limit: limit + 1,
      });

      // Process pagination results using helper
      const { itemsToReturn, hasMore, nextCursor } = processPaginationResults(
        itemsData,
        limit,
      );

      // Map to application feed items using helper
      const applicationFeedItems = mapToApplicationFeedItems(
        itemsToReturn,
        feedsById,
      );

      // Publish items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        GET_BY_VIEW_CHUNK_SIZE,
      )) {
        await publisher.publish(channel, {
          source: "category",
          chunk: {
            type: "feed-items",
            categoryId: input.categoryId,
            feedItems: chunk,
            visibilityFilter: input.visibilityFilter,
            hasMore,
            nextCursor,
          },
        });
      }

      // If no items, still publish an empty response
      if (applicationFeedItems.length === 0) {
        await publisher.publish(channel, {
          source: "category",
          chunk: {
            type: "feed-items",
            categoryId: input.categoryId,
            feedItems: [],
            visibilityFilter: input.visibilityFilter,
            hasMore: false,
            nextCursor: null,
          },
        });
      }
    } catch (error) {
      await publisher.publish(channel, {
        source: "category",
        chunk: {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to fetch items for category ${input.categoryId}`,
          phase: "feed-items",
        },
      });
      return { status: "error" };
    }

    return { status: "completed" };
  });

// ============================================================================
// LEGACY STREAMING PROCEDURES (kept for backward compatibility during migration)
// ============================================================================

export const getAllByView = protectedProcedure
  .input(z.object({ visibilityFilter: visibilityFilterSchema }).optional())
  .handler(async function* ({ context, input }) {
    const visibilityFilter = input?.visibilityFilter;
    const isVisibilityFilterFetch = !!visibilityFilter;

    // Step 1: Fetch all prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch initial data",
        phase: "initial-fetch",
      } as GetByViewChunk;
      return;
    }

    const { feedsList, contentCategoriesList, feedCategoriesList } =
      prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    // Step 2: Yield prerequisite data chunks (skip when fetching for visibility filter)
    if (!isVisibilityFilterFetch) {
      yield {
        type: "views",
        views: allViews,
      } as GetByViewChunk;

      yield {
        type: "feeds",
        feeds: applicationFeeds,
      } as GetByViewChunk;

      yield {
        type: "content-categories",
        contentCategories: contentCategoriesList,
      } as GetByViewChunk;

      yield {
        type: "feed-categories",
        feedCategories: feedCategoriesList,
      } as GetByViewChunk;

      // Step 3: Yield view-feeds chunks for each view
      for (const view of allViews) {
        const feedIdsForView = computeFeedsForView(
          view,
          applicationFeeds,
          feedCategoriesList,
          customViews,
          customViewCategoryIds,
        );

        yield {
          type: "view-feeds",
          viewId: view.id,
          feedIds: feedIdsForView,
        } as GetByViewChunk;
      }
    }

    const firstView = allViews[0];

    if (feedIds.length === 0 || !firstView) {
      if (!isVisibilityFilterFetch) {
        yield { type: "initial-data-complete" } as GetByViewChunk;
      }
      return;
    }

    const fetchContentForViewParams: FetchContentForViewParams = {
      feedIds,
      visibilityFilter,
      feedCategoriesList,
      customViewCategoryIds,
      customViews,
      applicationFeeds,
      feedsById,
    };

    // Step 4: Query and yield initial items (first 100) for EACH view
    for await (const viewResult of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      yield viewResult;
    }

    // Skip initial-data-complete and RSS fetch when fetching for visibility filter
    if (!isVisibilityFilterFetch) {
      // Signal that initial data is complete - client can hide loading screen
      yield { type: "initial-data-complete" } as GetByViewChunk;

      // Step 5: Run fetch and insert for fresh RSS items in background
      // Items are inserted to DB by fetchAndInsertFeedData - don't yield them here
      // Fresh items will be available via pagination (getItemsByVisibility)
      for await (const feedResult of fetchAndInsertFeedData(
        context,
        feedsList,
      )) {
        yield {
          type: "feed-status",
          status: feedResult.status,
          feedId: feedResult.id,
        } as GetByViewChunk;
        // Items already inserted to DB - they'll be included in pagination queries
      }
    }

    return;
  });

export const revalidateView = protectedProcedure
  .input(z.object({ viewId: z.number() }))
  .handler(async function* ({ context, input }) {
    // Step 1: Fetch all prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch initial data",
        phase: "initial-fetch",
      } as RevalidateViewChunk;
      return;
    }

    const { feedCategoriesList } = prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    // Find uncategorized view (always present in allViews with id === INBOX_VIEW_ID)
    const uncategorizedView = allViews.find((v) => v.id === INBOX_VIEW_ID)!;

    // Step 2: Yield views
    yield {
      type: "views",
      views: allViews,
    } as RevalidateViewChunk;

    // Step 3: Yield view-feeds chunks for each view
    for (const view of allViews) {
      const feedIdsForView = computeFeedsForView(
        view,
        applicationFeeds,
        feedCategoriesList,
        customViews,
        customViewCategoryIds,
      );

      yield {
        type: "view-feeds",
        viewId: view.id,
        feedIds: feedIdsForView,
      } as RevalidateViewChunk;
    }

    if (feedIds.length === 0) {
      return;
    }

    // Step 3: Find target view
    const targetView =
      input.viewId === INBOX_VIEW_ID
        ? uncategorizedView
        : allViews.find((v) => v.id === input.viewId);

    if (!targetView) {
      return;
    }

    // Helper function to query and yield feed items for a view (limited for pagination)
    async function* queryAndYieldFeedItemsForView(
      view: ApplicationView,
    ): AsyncGenerator<RevalidateViewChunk> {
      try {
        const filterConditions = [
          inArray(feedItems.feedId, feedIds),
          buildVisibilityFilter("unread"),
          buildViewCategoryFilter(
            view,
            feedCategoriesList,
            feedIds,
            customViewCategoryIds,
            customViews,
            applicationFeeds,
          ),
          buildContentTypeFilter(view.contentType, applicationFeeds),
          buildTimeWindowFilter(view.daysWindow),
        ].filter((f): f is NonNullable<typeof f> => f !== undefined);

        const filter =
          filterConditions.length > 0 ? and(...filterConditions) : undefined;

        // Only fetch initial batch - pagination handles the rest
        const itemsData = await context.db.query.feedItems.findMany({
          where: filter,
          orderBy: desc(feedItems.postedAt),
          limit: REVALIDATE_VIEW_CHUNK_SIZE,
        });

        // Map to application feed items using helper
        const applicationFeedItems = mapToApplicationFeedItems(
          itemsData,
          feedsById,
        );

        yield {
          type: "feed-items",
          viewId: view.id,
          feedItems: applicationFeedItems,
        } as RevalidateViewChunk;
      } catch (error) {
        yield {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to fetch items for view ${view.id}`,
          phase: "feed-items",
        } as RevalidateViewChunk;
      }
    }

    // Step 4: Query feed items for target view
    yield* queryAndYieldFeedItemsForView(targetView);

    // Step 5: If target is not Uncategorized, also query feed items for Uncategorized
    if (targetView.id !== INBOX_VIEW_ID) {
      yield* queryAndYieldFeedItemsForView(uncategorizedView);
    }

    return;
  });

export type GetItemsByVisibilityChunk =
  | {
      type: "feed-items";
      viewId: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter: string;
      hasMore: boolean;
      nextCursor: PaginationCursor;
    }
  | { type: "error"; message: string; phase: string };

export type GetItemsByFeedChunk =
  | {
      type: "feed-items";
      feedId: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter: string;
      hasMore: boolean;
      nextCursor: PaginationCursor;
    }
  | { type: "error"; message: string; phase: string };

export type GetItemsByCategoryIdChunk =
  | {
      type: "feed-items";
      categoryId: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter: string;
      hasMore: boolean;
      nextCursor: PaginationCursor;
    }
  | { type: "error"; message: string; phase: string };

/**
 * Fetch items for a specific visibility filter with cursor-based pagination.
 * Used for lazy loading "read" and "later" visibility filters,
 * and for infinite scroll pagination.
 */
export const getItemsByVisibility = protectedProcedure
  .input(
    z.object({
      viewId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Fetch prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch initial data",
        phase: "initial-fetch",
      } as GetItemsByVisibilityChunk;
      return;
    }

    const { feedCategoriesList } = prerequisiteData;

    // Build application data using helper
    const {
      customViews,
      allViews,
      customViewCategoryIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    if (feedIds.length === 0) {
      yield {
        type: "feed-items",
        viewId: input.viewId,
        feedItems: [],
        visibilityFilter: input.visibilityFilter,
        hasMore: false,
        nextCursor: null,
      } as GetItemsByVisibilityChunk;
      return;
    }

    // Find target view (INBOX_VIEW_ID maps to the Uncategorized view which is in allViews)
    const targetView = allViews.find((v) => v.id === input.viewId);

    if (!targetView) {
      yield {
        type: "error",
        message: `View with ID ${input.viewId} not found`,
        phase: "find-view",
      } as GetItemsByVisibilityChunk;
      return;
    }

    try {
      // Build filter conditions
      const filterConditions = [
        inArray(feedItems.feedId, feedIds),
        buildVisibilityFilter(input.visibilityFilter),
        buildViewCategoryFilter(
          targetView,
          feedCategoriesList,
          feedIds,
          customViewCategoryIds,
          customViews,
          applicationFeeds,
        ),
        buildContentTypeFilter(targetView.contentType, applicationFeeds),
        buildTimeWindowFilter(targetView.daysWindow),
        buildCursorCondition(input.cursor ?? null),
      ].filter((f): f is NonNullable<typeof f> => f !== undefined);

      const filter =
        filterConditions.length > 0 ? and(...filterConditions) : undefined;

      // Query limit + 1 to determine if there are more items
      const itemsData = await context.db.query.feedItems.findMany({
        where: filter,
        orderBy: desc(feedItems.postedAt),
        limit: limit + 1,
      });

      // Process pagination results using helper
      const { itemsToReturn, hasMore, nextCursor } = processPaginationResults(
        itemsData,
        limit,
      );

      // Map to application feed items using helper
      const applicationFeedItems = mapToApplicationFeedItems(
        itemsToReturn,
        feedsById,
      );

      // Yield items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        ITEMS_BY_VISIBILITY_CHUNK_SIZE,
      )) {
        yield {
          type: "feed-items",
          viewId: input.viewId,
          feedItems: chunk,
          visibilityFilter: input.visibilityFilter,
          hasMore,
          nextCursor,
        } as GetItemsByVisibilityChunk;
      }

      // If no items, still yield an empty response
      if (applicationFeedItems.length === 0) {
        yield {
          type: "feed-items",
          viewId: input.viewId,
          feedItems: [],
          visibilityFilter: input.visibilityFilter,
          hasMore: false,
          nextCursor: null,
        } as GetItemsByVisibilityChunk;
      }
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to fetch items for view ${input.viewId}`,
        phase: "feed-items",
      } as GetItemsByVisibilityChunk;
    }
  });
