import { z } from "zod";
import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import type {
  ApplicationFeed,
  ApplicationFeedItem,
  ApplicationView,
  DatabaseContentCategory,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import { prepareArrayChunks } from "~/lib/iterators";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import {
  buildContentTypeFilter,
  buildTimeWindowFilter,
  buildViewCategoryFilter,
  buildVisibilityFilter,
  isFeedCompatibleWithContentType,
} from "~/lib/data/feed-items/filters";
import { visibilityFilterSchema } from "~/lib/data/atoms";
import { sortViewsByPlacement } from "~/lib/data/views/utils";
import { buildUncategorizedView } from "~/server/api/utils/buildUncategorizedView";

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
import { parseArrayOfSchema } from "~/lib/schemas/utils";

export type PaginationCursor = { postedAt: Date; id: string } | null;

export type GetByViewChunk =
  | { type: "views"; views: ApplicationView[] }
  | { type: "feeds"; feeds: ApplicationFeed[] }
  | { type: "feed-categories"; feedCategories: DatabaseFeedCategory[] }
  | { type: "content-categories"; contentCategories: DatabaseContentCategory[] }
  | {
      type: "feed-items";
      viewId: number;
      feedItems: ApplicationFeedItem[];
      visibilityFilter?: string;
      hasMore?: boolean;
      nextCursor?: PaginationCursor;
    }
  | { type: "feed-status"; feedId: number; status: FetchFeedsStatus }
  | { type: "view-feeds"; viewId: number; feedIds: number[] }
  | { type: "initial-data-complete" }
  | { type: "error"; message: string; phase: string };

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

const GET_BY_VIEW_CHUNK_SIZE = 30;
const INITIAL_ITEMS_PER_VIEW = 30;

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

    const uncategorizedView = buildUncategorizedView(
      context.user.id,
      contentCategoriesList,
      customViews,
    );

    const allViews = sortViewsByPlacement([...customViews, uncategorizedView]);

    // Parse feeds to ApplicationFeed
    const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);

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
    const feedIds = feedsList.map((feed) => feed.id);

    if (feedIds.length === 0 || !firstView) {
      if (!isVisibilityFilterFetch) {
        yield { type: "initial-data-complete" } as GetByViewChunk;
      }
      return;
    }

    // Step 4: Query and yield initial items (first 100) for EACH view
    for (const view of allViews) {
      try {
        const filterConditions = [
          inArray(feedItems.feedId, feedIds),
          buildVisibilityFilter(visibilityFilter ?? "unread"),
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

          yield {
            type: "feed-items",
            viewId: view.id,
            feedItems: applicationItems,
            visibilityFilter: visibilityFilter ?? "unread",
          } as GetByViewChunk;
        }
      } catch (error) {
        yield {
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Failed to fetch initial items for view ${view.id}`,
          phase: "initial-items",
        } as GetByViewChunk;
        // Continue to next view instead of stopping
      }
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

const REVALIDATE_VIEW_CHUNK_SIZE = 30;

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

const ITEMS_PER_PAGE = 30;

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

    // Fetch feed categories
    const userContentCategoryIds = contentCategoriesList.map((cc) => cc.id);
    const feedCategoriesList =
      userContentCategoryIds.length > 0
        ? await context.db
            .select()
            .from(feedCategories)
            .where(inArray(feedCategories.categoryId, userContentCategoryIds))
        : [];

    // Get view categories
    const userViewIds = viewsList.map((v) => v.id);
    const viewCategoriesList =
      userViewIds.length > 0
        ? await context.db
            .select()
            .from(viewCategories)
            .where(inArray(viewCategories.viewId, userViewIds))
        : [];

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
        GET_BY_VIEW_CHUNK_SIZE,
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

/**
 * Fetch items for a specific feed with cursor-based pagination.
 * Used for lazy loading when a feed is selected in the sidebar.
 */
export const getItemsByFeed = protectedProcedure
  .input(
    z.object({
      feedId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Verify feed belongs to user
    const feed = await context.db.query.feeds.findFirst({
      where: and(eq(feeds.id, input.feedId), eq(feeds.userId, context.user.id)),
    });

    if (!feed) {
      yield {
        type: "error",
        message: `Feed with ID ${input.feedId} not found or does not belong to user`,
        phase: "verify-feed",
      } as GetItemsByFeedChunk;
      return;
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

      // Yield items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        GET_BY_VIEW_CHUNK_SIZE,
      )) {
        yield {
          type: "feed-items",
          feedId: input.feedId,
          feedItems: chunk,
          visibilityFilter: input.visibilityFilter,
          hasMore,
          nextCursor,
        } as GetItemsByFeedChunk;
      }

      // If no items, still yield an empty response
      if (applicationFeedItems.length === 0) {
        yield {
          type: "feed-items",
          feedId: input.feedId,
          feedItems: [],
          visibilityFilter: input.visibilityFilter,
          hasMore: false,
          nextCursor: null,
        } as GetItemsByFeedChunk;
      }
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to fetch items for feed ${input.feedId}`,
        phase: "feed-items",
      } as GetItemsByFeedChunk;
    }
  });

/**
 * Fetch items for feeds in a specific category with cursor-based pagination.
 * Used for lazy loading when a category is selected in the sidebar.
 */
export const getItemsByCategoryId = protectedProcedure
  .input(
    z.object({
      categoryId: z.number(),
      visibilityFilter: visibilityFilterSchema,
      cursor: cursorSchema.optional(),
      limit: z.number().min(1).max(500).optional(),
    }),
  )
  .handler(async function* ({ context, input }) {
    const limit = input.limit ?? ITEMS_PER_PAGE;

    // Verify category belongs to user
    const category = await context.db.query.contentCategories.findFirst({
      where: and(
        eq(contentCategories.id, input.categoryId),
        eq(contentCategories.userId, context.user.id),
      ),
    });

    if (!category) {
      yield {
        type: "error",
        message: `Category with ID ${input.categoryId} not found or does not belong to user`,
        phase: "verify-category",
      } as GetItemsByCategoryIdChunk;
      return;
    }

    // Get feed IDs in this category
    const categoryFeedLinks = await context.db
      .select()
      .from(feedCategories)
      .where(eq(feedCategories.categoryId, input.categoryId));

    const feedIdsInCategory = categoryFeedLinks.map((fc) => fc.feedId);

    if (feedIdsInCategory.length === 0) {
      yield {
        type: "feed-items",
        categoryId: input.categoryId,
        feedItems: [],
        visibilityFilter: input.visibilityFilter,
        hasMore: false,
        nextCursor: null,
      } as GetItemsByCategoryIdChunk;
      return;
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

      // Yield items in chunks for large result sets
      for (const chunk of prepareArrayChunks(
        applicationFeedItems,
        GET_BY_VIEW_CHUNK_SIZE,
      )) {
        yield {
          type: "feed-items",
          categoryId: input.categoryId,
          feedItems: chunk,
          visibilityFilter: input.visibilityFilter,
          hasMore,
          nextCursor,
        } as GetItemsByCategoryIdChunk;
      }

      // If no items, still yield an empty response
      if (applicationFeedItems.length === 0) {
        yield {
          type: "feed-items",
          categoryId: input.categoryId,
          feedItems: [],
          visibilityFilter: input.visibilityFilter,
          hasMore: false,
          nextCursor: null,
        } as GetItemsByCategoryIdChunk;
      }
    } catch (error) {
      yield {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to fetch items for category ${input.categoryId}`,
        phase: "feed-items",
      } as GetItemsByCategoryIdChunk;
    }
  });
