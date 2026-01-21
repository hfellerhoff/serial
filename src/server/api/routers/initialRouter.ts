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
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  feedsSchema,
  viewCategories,
  views,
} from "~/server/db/schema";
import { logMessage } from "~/server/logger";
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

  logMessage(`[Initial] Fetching items for view ${view.id}`);

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

    const {
      viewsList,
      feedsList,
      contentCategoriesList,
      feedCategoriesList,
      viewCategoriesList,
    } = prerequisiteData;

    logMessage(`[Initial] Loaded ${viewsList.length} views`);
    logMessage(`[Initial] Loaded ${feedsList.length} feeds`);
    logMessage(
      `[Initial] Loaded ${contentCategoriesList.length} content categories`,
    );
    logMessage(`[Initial] Loaded ${feedCategoriesList.length} feed categories`);
    logMessage(`[Initial] Loaded ${viewCategoriesList.length} view categories`);

    // Build application views using helper
    const { customViews, allViews, customViewCategoryIds } =
      buildApplicationViews(
        context.user.id,
        viewsList,
        contentCategoriesList,
        viewCategoriesList,
      );

    logMessage(`[Initial] Formed ${customViews.length} application views`);
    logMessage(`[Initial] Sorted ${allViews.length} views`);

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);

    logMessage(
      `[Initial] Parsed ${applicationFeeds.length} / ${feedsList.length} feeds`,
    );

    // Pre-build a Map for O(1) feed lookups by ID
    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    // Step 2: Publish prerequisite data chunks (skip when fetching for visibility filter)
    if (!isVisibilityFilterFetch) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "views", views: allViews },
      });

      logMessage(`[Initial] Published views`);

      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "feeds", feeds: applicationFeeds },
      });

      logMessage(`[Initial] Published feeds`);

      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "content-categories",
          contentCategories: contentCategoriesList,
        },
      });

      logMessage(`[Initial] Published content categories`);

      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "feed-categories", feedCategories: feedCategoriesList },
      });

      logMessage(`[Initial] Published feed categories`);

      // Step 3: Publish view-feeds chunks for each view
      for (const view of allViews) {
        const feedIdsForView = computeFeedsForView(
          view,
          applicationFeeds,
          feedCategoriesList,
          customViews,
          customViewCategoryIds,
        );

        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "view-feeds",
            viewId: view.id,
            feedIds: feedIdsForView,
          },
        });

        logMessage(
          `[Initial] Published ${feedIdsForView.length} feeds for view ${view.id}`,
        );
      }
    }

    const firstView = allViews[0];
    const feedIds = feedsList.map((feed) => feed.id);

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
      logMessage(
        `[Initial] Publishing ${viewResult.type} response for view ${viewResult.viewId}`,
      );
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

    const {
      viewsList,
      feedsList,
      contentCategoriesList,
      feedCategoriesList,
      viewCategoriesList,
    } = prerequisiteData;

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

    // Build application views and feedIdToViewIds map
    const { customViews, allViews, customViewCategoryIds } =
      buildApplicationViews(
        context.user.id,
        viewsList,
        contentCategoriesList,
        viewCategoriesList,
      );

    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);

    // Build feedId -> viewIds map
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

    const {
      viewsList,
      feedsList,
      contentCategoriesList,
      feedCategoriesList,
      viewCategoriesList,
    } = prerequisiteData;

    // Build application views using helper
    const { customViews, allViews, customViewCategoryIds } =
      buildApplicationViews(
        context.user.id,
        viewsList,
        contentCategoriesList,
        viewCategoriesList,
      );

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);
    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    const feedIds = feedsList.map((feed) => feed.id);

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

      // Determine if there are more items
      const hasMore = itemsData.length > limit;
      const itemsToReturn = hasMore ? itemsData.slice(0, limit) : itemsData;

      // Compute next cursor from the last item
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      const nextCursor: PaginationCursor =
        hasMore && lastItem
          ? { postedAt: lastItem.postedAt, id: lastItem.id }
          : null;

      const applicationFeedItems = itemsToReturn.map((item) => {
        const itemFeed = feedsById.get(item.feedId);
        return {
          ...item,
          platform: itemFeed?.platform ?? "youtube",
        } as ApplicationFeedItem;
      });

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

      // Determine if there are more items
      const hasMore = itemsData.length > limit;
      const itemsToReturn = hasMore ? itemsData.slice(0, limit) : itemsData;

      // Compute next cursor from the last item
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      const nextCursor: PaginationCursor =
        hasMore && lastItem
          ? { postedAt: lastItem.postedAt, id: lastItem.id }
          : null;

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

      // Determine if there are more items
      const hasMore = itemsData.length > limit;
      const itemsToReturn = hasMore ? itemsData.slice(0, limit) : itemsData;

      // Compute next cursor from the last item
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      const nextCursor: PaginationCursor =
        hasMore && lastItem
          ? { postedAt: lastItem.postedAt, id: lastItem.id }
          : null;

      const applicationFeedItems = itemsToReturn.map((item) => {
        const itemFeed = feedsById.get(item.feedId);
        return {
          ...item,
          platform: itemFeed?.platform ?? "youtube",
        } as ApplicationFeedItem;
      });

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
    // Step 1: Fetch all prerequisite data in parallel
    let initialData;

    try {
      initialData = await Promise.all([
        // Views
        context.db
          .select()
          .from(views)
          .where(eq(views.userId, context.user.id))
          .orderBy(asc(views.placement)),

        // Feeds
        context.db.query.feeds.findMany({
          where: eq(feeds.userId, context.user.id),
        }),

        // Content categories
        context.db
          .select()
          .from(contentCategories)
          .where(eq(contentCategories.userId, context.user.id))
          .orderBy(asc(contentCategories.name)),
      ]);
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

    const [viewsList, feedsList, contentCategoriesList] = initialData;

    logMessage(`[Initial] Loaded ${viewsList.length} views`);
    logMessage(`[Initial] Loaded ${feedsList.length} feeds`);
    logMessage(
      `[Initial] Loaded ${contentCategoriesList.length} content categories`,
    );

    // Fetch feed categories and view categories in parallel
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

    logMessage(`[Initial] Loaded ${feedCategoriesList.length} feed categories`);
    logMessage(`[Initial] Loaded ${viewCategoriesList.length} view categories`);

    // Transform views to ApplicationView with categoryIds
    const customViews: ApplicationView[] = viewsList.map((view) => ({
      ...view,
      isDefault: false,
      categoryIds: viewCategoriesList
        .filter((vc) => vc.viewId === view.id)
        .map((vc) => vc.categoryId)
        .filter((id): id is number => id !== null),
    }));

    logMessage(`[Initial] Formed ${customViews.length} application views`);

    const uncategorizedView = buildUncategorizedView(
      context.user.id,
      contentCategoriesList,
      customViews,
    );

    const allViews = sortViewsByPlacement([...customViews, uncategorizedView]);

    logMessage(`[Initial] Sorted ${allViews.length} views`);

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);

    logMessage(
      `[Initial] Parsed ${applicationFeeds.length} / ${feedsList.length} feeds`,
    );

    // Pre-build a Map for O(1) feed lookups by ID
    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    // Collect all category IDs used by custom views (for Uncategorized view exclusion)
    const customViewCategoryIds = new Set(
      customViews.flatMap((v) => v.categoryIds),
    );

    // Step 2: Yield prerequisite data chunks (skip when fetching for visibility filter)
    if (!isVisibilityFilterFetch) {
      yield {
        type: "views",
        views: allViews,
      } as GetByViewChunk;

      logMessage(`[Initial] Yielded views`);

      yield {
        type: "feeds",
        feeds: applicationFeeds,
      } as GetByViewChunk;

      logMessage(`[Initial] Yielded feeds`);

      yield {
        type: "content-categories",
        contentCategories: contentCategoriesList,
      } as GetByViewChunk;

      logMessage(`[Initial] Yielded content categories`);

      yield {
        type: "feed-categories",
        feedCategories: feedCategoriesList,
      } as GetByViewChunk;

      logMessage(`[Initial] Yielded feed categories`);

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

        logMessage(
          `[Initial] Yielded ${feedIdsForView.length} feeds for view ${view.id}`,
        );
      }
    }

    const firstView = allViews[0];
    const feedIds = feedsList.map((feed) => feed.id);

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
      logMessage(
        `[Initial] Yielded ${viewResult.type} response for view ${viewResult.viewId}`,
      );
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
    // Step 1: Fetch all prerequisite data in parallel
    let initialData;

    try {
      initialData = await Promise.all([
        // Views
        context.db
          .select()
          .from(views)
          .where(eq(views.userId, context.user.id))
          .orderBy(asc(views.placement)),

        // Feeds
        context.db.query.feeds.findMany({
          where: eq(feeds.userId, context.user.id),
        }),

        // Content categories
        context.db
          .select()
          .from(contentCategories)
          .where(eq(contentCategories.userId, context.user.id))
          .orderBy(asc(contentCategories.name)),
      ]);
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

    const [viewsList, feedsList, contentCategoriesList] = initialData;

    // Fetch feed categories filtered by user's content categories
    const userContentCategoryIds = contentCategoriesList.map((cc) => cc.id);
    const feedCategoriesList =
      userContentCategoryIds.length > 0
        ? await context.db
            .select()
            .from(feedCategories)
            .where(inArray(feedCategories.categoryId, userContentCategoryIds))
        : [];

    // Get view categories filtered by user's views
    const userViewIds = viewsList.map((v) => v.id);
    const viewCategoriesList =
      userViewIds.length > 0
        ? await context.db
            .select()
            .from(viewCategories)
            .where(inArray(viewCategories.viewId, userViewIds))
        : [];

    // Transform views to ApplicationView with categoryIds
    const customViews: ApplicationView[] = viewsList.map((view) => ({
      ...view,
      isDefault: false,
      categoryIds: viewCategoriesList
        .filter((vc) => vc.viewId === view.id)
        .map((vc) => vc.categoryId)
        .filter((id): id is number => id !== null),
    }));

    // Build Uncategorized view
    const uncategorizedView = buildUncategorizedView(
      context.user.id,
      contentCategoriesList,
      customViews,
    );

    // All views including Uncategorized, sorted by placement
    const allViews = sortViewsByPlacement([...customViews, uncategorizedView]);

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);

    // Pre-build a Map for O(1) feed lookups by ID
    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    // Collect all category IDs used by custom views (for Uncategorized view exclusion)
    const customViewCategoryIds = new Set(
      customViews.flatMap((v) => v.categoryIds),
    );

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

    const feedIds = feedsList.map((feed) => feed.id);

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

        const applicationFeedItems = itemsData.map((item) => {
          const itemFeed = feedsById.get(item.feedId);

          return {
            ...item,
            platform: itemFeed?.platform ?? "youtube",
          } as ApplicationFeedItem;
        });

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

    // Fetch prerequisite data
    let initialData;

    try {
      initialData = await Promise.all([
        // Views
        context.db
          .select()
          .from(views)
          .where(eq(views.userId, context.user.id))
          .orderBy(asc(views.placement)),

        // Feeds
        context.db.query.feeds.findMany({
          where: eq(feeds.userId, context.user.id),
        }),

        // Content categories
        context.db
          .select()
          .from(contentCategories)
          .where(eq(contentCategories.userId, context.user.id))
          .orderBy(asc(contentCategories.name)),
      ]);
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

    const [viewsList, feedsList, contentCategoriesList] = initialData;

    // Fetch feed categories and view categories in parallel
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

    // Build application views
    const customViews: ApplicationView[] = viewsList.map((view) => ({
      ...view,
      isDefault: false,
      categoryIds: viewCategoriesList
        .filter((vc) => vc.viewId === view.id)
        .map((vc) => vc.categoryId)
        .filter((id): id is number => id !== null),
    }));

    const uncategorizedView = buildUncategorizedView(
      context.user.id,
      contentCategoriesList,
      customViews,
    );

    const allViews = sortViewsByPlacement([...customViews, uncategorizedView]);

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);
    const feedsById = new Map(feedsList.map((f) => [f.id, f]));

    // Collect custom view category IDs
    const customViewCategoryIds = new Set(
      customViews.flatMap((v) => v.categoryIds),
    );

    const feedIds = feedsList.map((feed) => feed.id);

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

    // Find target view
    const targetView =
      input.viewId === INBOX_VIEW_ID
        ? uncategorizedView
        : allViews.find((v) => v.id === input.viewId);

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

      // Determine if there are more items
      const hasMore = itemsData.length > limit;
      const itemsToReturn = hasMore ? itemsData.slice(0, limit) : itemsData;

      // Compute next cursor from the last item
      const lastItem = itemsToReturn[itemsToReturn.length - 1];
      const nextCursor: PaginationCursor =
        hasMore && lastItem
          ? { postedAt: lastItem.postedAt, id: lastItem.id }
          : null;

      const applicationFeedItems = itemsToReturn.map((item) => {
        const itemFeed = feedsById.get(item.feedId);
        return {
          ...item,
          platform: itemFeed?.platform ?? "youtube",
        } as ApplicationFeedItem;
      });

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
