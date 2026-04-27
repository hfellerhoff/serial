import { and, asc, desc, eq, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import {
  GET_BY_VIEW_CHUNK_SIZE,
  INITIAL_ITEMS_PER_VIEW,
  ITEMS_BY_VISIBILITY_CHUNK_SIZE,
  ITEMS_PER_PAGE,
  REVALIDATE_VIEW_CHUNK_SIZE,
} from "../constants";
import { publisher, trackChannelConnection } from "../publisher";
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
  DatabaseViewFeed,
} from "~/server/db/schema";
import type { ORPCContext } from "~/server/orpc/base";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";
import { captureException } from "~/server/logger";
import {
  checkUserRefreshEligibility,
  getFeedsActivationBudget,
} from "~/server/subscriptions/helpers";
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
import { dbSemaphore } from "~/lib/semaphore";
import { workerPool } from "~/lib/workerPool";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  feedsSchema,
  viewCategories,
  viewFeeds,
  views,
} from "~/server/db/schema";
import { protectedProcedure } from "~/server/orpc/base";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";
import { refreshUserFeeds } from "~/server/rss/refreshUserFeeds";

export type PaginationCursor = { postedAt: Date; id: string } | null;

export type ClientManifestEntry = {
  id: string;
  contentHash: string | null;
};

export type DiffEntry =
  | { status: "unchanged"; id: string }
  | { status: "updated"; item: ApplicationFeedItem }
  | { status: "new"; item: ApplicationFeedItem }
  | { status: "deleted"; id: string };

type ViewBoundary = {
  oldestPostedAt: Date | null;
  sentItemIds: Set<string>;
};

type FetchContentForViewResult = {
  chunk: ViewDataChunk;
  boundary: ViewBoundary;
};

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
  | { type: "refresh-start"; totalFeeds: number; nextRefreshAt: Date | null }
  | { type: "refresh-complete" }
  | { type: "view-items"; viewId: number; feedItemIds: string[] }
  | {
      type: "import-feed-inserted";
      feedUrl: string;
      feedId: number;
      feed: ApplicationFeed;
    }
  | { type: "import-feed-error"; feedUrl: string; error: string }
  | { type: "import-start"; totalFeeds: number }
  | {
      type: "import-limit-warning";
      deactivatedCount: number;
      maxActiveFeeds: number;
    }
  | {
      type: "view-diff";
      viewId: number;
      visibilityFilter: string;
      diff: DiffEntry[];
      cursor: PaginationCursor;
      hasMore: boolean;
    }
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

function buildFeedCategoriesMap(
  allFeedCategories: DatabaseFeedCategory[],
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const fc of allFeedCategories) {
    const existing = map.get(fc.feedId);
    if (existing) {
      existing.push(fc.categoryId);
    } else {
      map.set(fc.feedId, [fc.categoryId]);
    }
  }
  return map;
}

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
  feedCategoriesMap?: Map<number, number[]>,
  customViewFeedIds?: Set<number>,
): number[] {
  const feedIds: number[] = [];

  const categoryMap =
    feedCategoriesMap ?? buildFeedCategoriesMap(allFeedCategories);

  // For non-inbox views, start with directly assigned feeds
  if (view.id !== INBOX_VIEW_ID) {
    feedIds.push(...view.feedIds);
  }

  for (const feed of allFeeds) {
    // Skip if already included via direct assignment
    if (feedIds.includes(feed.id)) continue;

    // Check if feed's content type is compatible with the view
    const isCompatible = isFeedCompatibleWithContentType(
      feed.platform,
      view.contentType,
    );
    if (!isCompatible) {
      continue;
    }

    const feedCategoryIds = categoryMap.get(feed.id) ?? [];

    // For Uncategorized view, include feeds that are NOT in any custom view category
    // or feeds that are in the Uncategorized view's category list
    if (view.id === INBOX_VIEW_ID) {
      // Exclude feeds directly assigned to any custom view
      if (customViewFeedIds?.has(feed.id)) {
        continue;
      }

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
      // Empty categoryIds and feedIds means "all categories" (no category filter)
      if (view.categoryIds.length === 0 && view.feedIds.length === 0) {
        feedIds.push(feed.id);
      } else if (view.categoryIds.length > 0) {
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
): Promise<FetchContentForViewResult> {
  visibilityFilter ??= "unread";

  // Default empty boundary
  const emptyBoundary: ViewBoundary = {
    oldestPostedAt: null,
    sentItemIds: new Set(),
  };

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

      // Compute boundary: track sent item IDs and oldest postedAt
      const sentItemIds = new Set(initialItems.map((item) => item.id));
      const oldestPostedAt = initialItems[initialItems.length - 1]!.postedAt;

      return {
        chunk: {
          type: "feed-items",
          viewId: view.id,
          feedItems: applicationItems,
          visibilityFilter: visibilityFilter,
        },
        boundary: {
          oldestPostedAt,
          sentItemIds,
        },
      };
    }
  } catch (error) {
    captureException(error);
    return {
      chunk: {
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : `Failed to fetch initial items for view ${view.id}`,
        phase: "initial-items",
        viewId: view.id,
      },
      boundary: emptyBoundary,
    };
    // Continue to next view instead of stopping
  }

  return {
    chunk: {
      type: "feed-items",
      viewId: view.id,
      feedItems: [],
      visibilityFilter: visibilityFilter,
    },
    boundary: emptyBoundary,
  };
}

async function* fetchContentForViews(
  context: ORPCContext,
  viewList: ApplicationView[],
  params: FetchContentForViewParams,
): AsyncGenerator<FetchContentForViewResult> {
  const pendingPromises = new Map<number, Promise<FetchContentForViewResult>>();

  for (const view of viewList) {
    // Wrap each promise to include viewId resolution tracking
    const promise = fetchContentForView(context, view, params);
    pendingPromises.set(view.id, promise);
  }

  while (pendingPromises.size > 0) {
    const result = await Promise.any(pendingPromises.values());

    if (
      result.chunk.type === "feed-items" &&
      result.chunk.viewId !== undefined
    ) {
      pendingPromises.delete(result.chunk.viewId);
    } else if (
      result.chunk.type === "error" &&
      result.chunk.viewId !== undefined
    ) {
      pendingPromises.delete(result.chunk.viewId);
    }
    yield result;
  }

  return;
}

/**
 * Compute a diff between the server's authoritative items and the client's
 * cached manifest for a view. Returns DiffEntry[] describing what changed.
 *
 * - "unchanged": client has correct version (matched by contentHash)
 * - "updated": client has stale version (hash mismatch or null hash)
 * - "new": client doesn't have this item
 * - "deleted": client has item but server doesn't (no longer in scope)
 */
function computeViewDiff(
  serverItems: ApplicationFeedItem[],
  clientManifest: ClientManifestEntry[],
): DiffEntry[] {
  const clientMap = new Map<string, string | null>();
  for (const entry of clientManifest) {
    clientMap.set(entry.id, entry.contentHash);
  }

  const serverIds = new Set<string>();
  const diff: DiffEntry[] = [];

  for (const item of serverItems) {
    serverIds.add(item.id);

    if (!clientMap.has(item.id)) {
      diff.push({ status: "new", item });
    } else {
      const clientHash = clientMap.get(item.id);
      // null hash on either side means we can't confirm match — treat as updated
      const hashesMatch =
        clientHash !== null &&
        item.contentHash !== null &&
        clientHash === item.contentHash;

      if (hashesMatch) {
        diff.push({ status: "unchanged", id: item.id });
      } else {
        diff.push({ status: "updated", item });
      }
    }
  }

  // Items the client has that the server doesn't → deleted
  for (const entry of clientManifest) {
    if (!serverIds.has(entry.id)) {
      diff.push({ status: "deleted", id: entry.id });
    }
  }

  return diff;
}

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
  viewFeedsList: DatabaseViewFeed[];
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

  const [feedCategoriesList, viewCategoriesList, viewFeedsList] =
    await Promise.all([
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
      userViewIds.length > 0
        ? context.db
            .select()
            .from(viewFeeds)
            .where(inArray(viewFeeds.viewId, userViewIds))
        : Promise.resolve([]),
    ]);

  return {
    viewsList,
    feedsList,
    contentCategoriesList,
    feedCategoriesList,
    viewCategoriesList,
    viewFeedsList,
  };
}

type ApplicationViewsData = {
  customViews: ApplicationView[];
  allViews: ApplicationView[];
  customViewCategoryIds: Set<number>;
  customViewFeedIds: Set<number>;
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
  viewFeedsList: PrerequisiteData["viewFeedsList"],
): ApplicationViewsData {
  // Transform database views to ApplicationView with categoryIds and feedIds
  const customViews: ApplicationView[] = viewsList.map((view) => ({
    ...view,
    isDefault: false,
    categoryIds: viewCategoriesList
      .filter((vc) => vc.viewId === view.id)
      .map((vc) => vc.categoryId)
      .filter((id): id is number => id !== null),
    feedIds: viewFeedsList
      .filter((vf) => vf.viewId === view.id)
      .map((vf) => vf.feedId),
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

  // Collect all feed IDs directly assigned to custom views
  const customViewFeedIds = new Set(customViews.flatMap((v) => v.feedIds));

  return { customViews, allViews, customViewCategoryIds, customViewFeedIds };
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
  customViewFeedIds: Set<number>;
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
  const {
    viewsList,
    feedsList,
    contentCategoriesList,
    viewCategoriesList,
    viewFeedsList,
  } = prerequisiteData;

  const { customViews, allViews, customViewCategoryIds, customViewFeedIds } =
    buildApplicationViews(
      userId,
      viewsList,
      contentCategoriesList,
      viewCategoriesList,
      viewFeedsList,
    );

  const applicationFeeds = parseArrayOfSchema(feedsList, feedsSchema);
  const feedsById = new Map(feedsList.map((f) => [f.id, f]));
  const feedIds = feedsList.map((feed) => feed.id);

  return {
    customViews,
    allViews,
    customViewCategoryIds,
    customViewFeedIds,
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
  source: "initial",
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

type PublishViewFeedsResult = {
  feedIdToViewIds?: Map<number, number[]>;
};

/**
 * Publish view-feeds chunks for all views.
 * Optionally builds and returns feedIdToViewIds map.
 */
async function publishViewFeedsChunks(
  channel: string,
  source: "initial",
  params: {
    allViews: ApplicationView[];
    applicationFeeds: ApplicationFeed[];
    feedCategoriesList: DatabaseFeedCategory[];
    customViews: ApplicationView[];
    customViewCategoryIds: Set<number>;
    customViewFeedIds: Set<number>;
    buildFeedIdToViewIds?: boolean;
  },
): Promise<PublishViewFeedsResult> {
  const {
    allViews,
    applicationFeeds,
    feedCategoriesList,
    customViews,
    customViewCategoryIds,
    customViewFeedIds,
    buildFeedIdToViewIds,
  } = params;

  const feedIdToViewIds = buildFeedIdToViewIds
    ? new Map<number, number[]>()
    : undefined;

  const feedCategoriesMap = buildFeedCategoriesMap(feedCategoriesList);

  for (const view of allViews) {
    const feedIdsForView = computeFeedsForView(
      view,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
      feedCategoriesMap,
      customViewFeedIds,
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
        const existingViewIds = feedIdToViewIds.get(feedId);
        if (existingViewIds) {
          existingViewIds.push(view.id);
        } else {
          feedIdToViewIds.set(feedId, [view.id]);
        }
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
  const untrack = trackChannelConnection(channel);

  try {
    const iterator = publisher.subscribe(channel, { signal, lastEventId });

    for await (const payload of iterator) {
      yield payload;
    }
  } finally {
    untrack();
  }
});

// ============================================================================
// REQUEST PROCEDURES (publish instead of yield)
// ============================================================================

/**
 * Request initial data load. Data is published to the user's channel.
 *
 * The client sends a `viewManifests` map of its cached items per view so the
 * server can compute a diff and stream only what changed. If no manifests are
 * provided (fresh client), all items are streamed as "new".
 *
 * Flow:
 *   1. Publish metadata (views, feeds, categories, view-feeds)
 *   2. For each view, query server's correct initial items per visibility
 *      filter and publish a view-diff chunk. Unread is published first,
 *      followed by read/later after initial-data-complete.
 *   3. Publish initial-data-complete (client can show UI)
 *   4. Publish read/later diffs
 *   5. If feeds are due for refresh, call refreshUserFeeds
 */
export const requestInitialData = protectedProcedure
  .input(
    z
      .object({
        viewManifests: z.record(
          z.coerce.number(),
          z.record(
            z.string(), // visibility filter key ("unread", "read", "later")
            z.array(
              z.object({
                id: z.string(),
                contentHash: z.string().nullable(),
              }),
            ),
          ),
        ),
      })
      .partial()
      .optional(),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const viewManifests = input?.viewManifests ?? {};

    // Step 1: Fetch all prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      captureException(error);
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
      customViewFeedIds,
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

    // Step 3: Publish view-feeds chunks for each view
    await publishViewFeedsChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
      customViewFeedIds,
    });

    const firstView = allViews[0];

    if (feedIds.length === 0 || !firstView) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "initial-data-complete" },
      });
      return { status: "completed" };
    }

    // Helper: query initial items for a view + visibility, diff against
    // client manifest, and publish a view-diff chunk.
    async function queryAndPublishViewDiff(
      view: ApplicationView,
      visibilityFilter: VisibilityFilter,
    ) {
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

        // Query limit + 1 to determine hasMore
        const itemsData = await context.db.query.feedItems.findMany({
          where: filter,
          orderBy: desc(feedItems.postedAt),
          limit: INITIAL_ITEMS_PER_VIEW + 1,
        });

        const hasMore = itemsData.length > INITIAL_ITEMS_PER_VIEW;
        const serverItems = hasMore
          ? itemsData.slice(0, INITIAL_ITEMS_PER_VIEW)
          : itemsData;

        const lastItem = serverItems[serverItems.length - 1];
        const cursor: PaginationCursor = lastItem
          ? { postedAt: lastItem.postedAt, id: lastItem.id }
          : null;

        // Map to ApplicationFeedItem with platform
        const applicationItems = serverItems.map((item) => {
          const itemFeed = feedsById.get(item.feedId);
          return {
            ...item,
            platform: itemFeed?.platform ?? "youtube",
          } as ApplicationFeedItem;
        });

        // Get the client manifest for this specific view + visibility filter.
        // Each visibility filter is diffed independently, so we must only
        // compare against items the client has for that same filter.
        // Using the full manifest would cause read/later items to appear
        // as "deleted" during the unread diff (and vice versa).
        const clientManifest = viewManifests[view.id]?.[visibilityFilter] ?? [];

        const diff = computeViewDiff(applicationItems, clientManifest);

        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "view-diff",
            viewId: view.id,
            visibilityFilter,
            diff,
            cursor,
            hasMore,
          },
        });
      } catch (error) {
        captureException(error);
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : `Failed to diff items for view ${view.id}`,
            phase: "view-diff",
            viewId: view.id,
          },
        });
      }
    }

    // Step 4: Publish unread diffs for all views (highest priority)
    for (const view of allViews) {
      await queryAndPublishViewDiff(view, "unread");
    }

    // Signal that initial (unread) data is complete — client can show UI
    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "initial-data-complete" },
    });

    // Step 5: Publish read and later diffs for all views
    for (const view of allViews) {
      await queryAndPublishViewDiff(view, "read");
      await queryAndPublishViewDiff(view, "later");
    }

    // Step 6: Check refresh rate limit and publish refresh-start. The
    // cooldown + total feeds are streamed before the slow RSS fetch so the
    // client can show loading state immediately.
    const eligibility = await checkUserRefreshEligibility(
      context.db,
      context.user.id,
    );

    const feedsDue = eligibility.eligible
      ? feedsList.filter(
          (f) => f.isActive && (!f.nextFetchAt || f.nextFetchAt <= new Date()),
        )
      : [];

    await publisher.publish(channel, {
      source: "initial",
      chunk: {
        type: "refresh-start",
        totalFeeds: feedsDue.length,
        nextRefreshAt: eligibility.nextRefreshAt,
      },
    });

    // Step 7: Run RSS fetch if eligible.
    if (eligibility.eligible) {
      await refreshUserFeeds({
        db: context.db,
        feedsList,
        channel,
      });
    }

    // Step 8: Always signal completion so the client exits loading state.
    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "refresh-complete" },
    });

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
      captureException(error);
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
      customViewFeedIds,
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

    // Step 3: Publish view-feeds chunks
    await publishViewFeedsChunks(channel, "initial", {
      allViews,
      applicationFeeds,
      feedCategoriesList,
      customViews,
      customViewCategoryIds,
      customViewFeedIds,
      buildFeedIdToViewIds: false,
    });
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
    for await (const { chunk } of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk,
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
      importMode: z.enum(["tags", "views", "ignore"]).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const importMode = input.importMode ?? "tags";
    const channel = getUserChannel(context.user.id);
    const BATCH_SIZE = 4;

    if (!input.feeds.length) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: { type: "initial-data-complete" },
      });
      return { status: "completed" };
    }

    // Check activation budget upfront
    const { remainingSlots, maxActiveFeeds } = await getFeedsActivationBudget(
      context.db,
      context.user.id,
    );
    const deactivatedCount = Math.max(0, input.feeds.length - remainingSlots);

    // Pre-calculate which feeds should be active. Strip categories for any
    // mode other than "tags" — we only want to create category links when
    // the user explicitly chose to import sections as tags. The original
    // categories list is preserved on the side for "views" mode below.
    const feedsWithActivation = input.feeds.map((feed, index) => ({
      feedUrl: feed.feedUrl,
      categories: importMode === "tags" ? feed.categories : [],
      originalCategories: feed.categories,
      shouldBeActive: index < remainingSlots,
    }));

    // Publish import start with total feeds count (must come before
    // import-limit-warning so the client's loading machine is initialized first)
    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "import-start", totalFeeds: input.feeds.length },
    });

    // Publish warning if some feeds will be inactive
    if (deactivatedCount > 0) {
      await publisher.publish(channel, {
        source: "initial",
        chunk: {
          type: "import-limit-warning",
          deactivatedCount,
          maxActiveFeeds,
        },
      });
    }

    // Track successful feed IDs for building view mappings later
    const successfulFeeds: Array<{
      feedId: number;
      feed: typeof feeds.$inferSelect;
      sectionNames: string[];
    }> = [];

    // Worker function: insert feed + fetch RSS content
    async function processFeed(feedInput: (typeof feedsWithActivation)[0]) {
      const IMPORT_TIMEOUT_MS = 15_000; // 15 seconds

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Import timed out")),
          IMPORT_TIMEOUT_MS,
        );
      });

      const importPromise = (async () => {
        // 1. Insert feed within a transaction (rate-limited)
        const insertResult = await dbSemaphore.run(() =>
          context.db.transaction(async (tx) => {
            return await insertFeedWithCategories(
              tx,
              context.user.id,
              feedInput,
              feedInput.shouldBeActive,
            );
          }),
        );

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
          sectionNames: feedInput.originalCategories,
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
      })();

      try {
        return await Promise.race([importPromise, timeoutPromise]);
      } catch (error) {
        captureException(error);
        await publisher.publish(channel, {
          source: "initial",
          chunk: {
            type: "import-feed-error",
            feedUrl: feedInput.feedUrl,
            error: error instanceof Error ? error.message : "Import timed out",
          },
        });
        return { success: false as const, feedUrl: feedInput.feedUrl };
      }
    }

    // Process all feeds through worker pool
    const workerIterator = workerPool(
      feedsWithActivation,
      BATCH_SIZE,
      processFeed,
    );
    // Consume the iterator - results are published via side effects in processFeed
    while (!(await workerIterator.next()).done) {
      // Results stream as each feed completes
    }

    // For "views" mode: create (or reuse) a view per unique section name and
    // link successfully-imported feeds to those views via the viewFeeds table.
    if (importMode === "views" && successfulFeeds.length > 0) {
      const sectionNames = new Set<string>();
      for (const sf of successfulFeeds) {
        for (const name of sf.sectionNames) {
          if (name) sectionNames.add(name);
        }
      }

      if (sectionNames.size > 0) {
        await context.db.transaction(async (tx) => {
          // Look up existing views by name for this user
          const existingViews = await tx
            .select()
            .from(views)
            .where(eq(views.userId, context.user.id));
          const existingByName = new Map(existingViews.map((v) => [v.name, v]));

          // Insert any missing views with default settings
          const namesToCreate = [...sectionNames].filter(
            (name) => !existingByName.has(name),
          );
          if (namesToCreate.length > 0) {
            const inserted = await tx
              .insert(views)
              .values(
                namesToCreate.map((name) => ({
                  userId: context.user.id,
                  name,
                })),
              )
              .returning();
            for (const v of inserted) {
              existingByName.set(v.name, v);
            }
          }

          // Build viewFeeds rows
          const viewFeedRows: Array<{ viewId: number; feedId: number }> = [];
          for (const sf of successfulFeeds) {
            for (const name of sf.sectionNames) {
              const view = existingByName.get(name);
              if (!view) continue;
              viewFeedRows.push({ viewId: view.id, feedId: sf.feedId });
            }
          }

          if (viewFeedRows.length > 0) {
            await tx
              .insert(viewFeeds)
              .values(viewFeedRows)
              .onConflictDoNothing();
          }
        });
      }
    }

    // After all feeds complete, publish updated prerequisite data
    const prerequisiteData = await fetchUserPrerequisiteData(context);
    const { contentCategoriesList, feedCategoriesList } = prerequisiteData;

    const {
      customViews,
      allViews,
      customViewCategoryIds,
      customViewFeedIds,
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
      customViewFeedIds,
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

    for await (const { chunk } of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      await publisher.publish(channel, {
        source: "initial",
        chunk,
      });
    }

    await publisher.publish(channel, {
      source: "initial",
      chunk: { type: "initial-data-complete" },
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
      clientItems: z
        .array(
          z.object({
            id: z.string(),
            contentHash: z.string().nullable(),
          }),
        )
        .optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const channel = getUserChannel(context.user.id);
    const limit = input.limit ?? ITEMS_PER_PAGE;
    const clientItems = input.clientItems;

    // Fetch prerequisite data using helper
    let prerequisiteData: PrerequisiteData;
    try {
      prerequisiteData = await fetchUserPrerequisiteData(context);
    } catch (error) {
      captureException(error);
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
      customViewFeedIds,
      applicationFeeds,
      feedsById,
      feedIds,
    } = prepareApplicationData(context.user.id, prerequisiteData);

    if (feedIds.length === 0) {
      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "view-diff",
          viewId: input.viewId,
          visibilityFilter: input.visibilityFilter,
          diff: [],
          cursor: null,
          hasMore: false,
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
          customViewFeedIds,
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

      // Always use diff-based response
      const diff = computeViewDiff(applicationFeedItems, clientItems ?? []);

      await publisher.publish(channel, {
        source: "visibility",
        chunk: {
          type: "view-diff",
          viewId: input.viewId,
          visibilityFilter: input.visibilityFilter,
          diff,
          cursor: nextCursor,
          hasMore,
        },
      });
    } catch (error) {
      captureException(error);
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
      captureException(error);
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
      captureException(error);
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
      captureException(error);
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
      customViewFeedIds,
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
      const feedCategoriesMap = buildFeedCategoriesMap(feedCategoriesList);
      for (const view of allViews) {
        const feedIdsForView = computeFeedsForView(
          view,
          applicationFeeds,
          feedCategoriesList,
          customViews,
          customViewCategoryIds,
          feedCategoriesMap,
          customViewFeedIds,
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
    for await (const { chunk } of fetchContentForViews(
      context,
      allViews,
      fetchContentForViewParams,
    )) {
      yield chunk;
    }

    // Skip initial-data-complete and RSS fetch when fetching for visibility filter
    if (!isVisibilityFilterFetch) {
      // Signal that initial data is complete - client can hide loading screen
      yield { type: "initial-data-complete" } as GetByViewChunk;

      // Step 5: Run fetch and insert for fresh RSS items in background
      // Items are inserted to DB by fetchAndInsertFeedData - don't yield them here
      // Fresh items will be available via pagination (getItemsByVisibility)
      const activeFeedsForLegacy = feedsList.filter((feed) => feed.isActive);
      for await (const feedResult of fetchAndInsertFeedData(
        context,
        activeFeedsForLegacy,
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
      captureException(error);
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
      customViewFeedIds,
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
    const feedCategoriesMap = buildFeedCategoriesMap(feedCategoriesList);
    for (const view of allViews) {
      const feedIdsForView = computeFeedsForView(
        view,
        applicationFeeds,
        feedCategoriesList,
        customViews,
        customViewCategoryIds,
        feedCategoriesMap,
        customViewFeedIds,
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
        captureException(error);
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
  | {
      type: "view-diff";
      viewId: number;
      visibilityFilter: string;
      diff: DiffEntry[];
      cursor: PaginationCursor;
      hasMore: boolean;
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
      captureException(error);
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
      customViewFeedIds,
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
          customViewFeedIds,
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
      captureException(error);
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
