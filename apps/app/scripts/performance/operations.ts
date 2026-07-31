import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { db as applicationDatabase } from "~/server/db";
import { buildVisibilityFilter } from "~/lib/data/feed-items/filters";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { queryMixedContentPage } from "~/server/mixed-content/projection";

type Database = typeof applicationDatabase;

const feedItemColumns = {
  id: feedItems.id,
  feedId: feedItems.feedId,
  contentId: feedItems.contentId,
  title: feedItems.title,
  author: feedItems.author,
  url: feedItems.url,
  thumbnail: feedItems.thumbnail,
  content: feedItems.content,
  contentSnippet: feedItems.contentSnippet,
  isWatched: feedItems.isWatched,
  isWatchedUpdatedAt: feedItems.isWatchedUpdatedAt,
  isWatchLater: feedItems.isWatchLater,
  isWatchLaterUpdatedAt: feedItems.isWatchLaterUpdatedAt,
  progress: feedItems.progress,
  duration: feedItems.duration,
  orientation: feedItems.orientation,
  postedAt: feedItems.postedAt,
  createdAt: feedItems.createdAt,
  updatedAt: feedItems.updatedAt,
  contentHash: feedItems.contentHash,
};

/**
 * Benchmark adapter for the existing production view-page query path.
 *
 * The adapter deliberately performs the same prerequisite loads as
 * requestItemsByVisibility before executing the bounded feed-item query. The
 * fixture's comparison view has no assignments, which is the production "all
 * feeds" semantic and avoids introducing benchmark-only membership shortcuts.
 */
export async function queryFeedViewPage(input: {
  database: Database;
  userId: string;
  viewId: number;
  visibility: VisibilityFilter;
  limit: number;
}) {
  const { database, userId, viewId, visibility, limit } = input;
  const [viewRows, feedRows, categoryRows] = await Promise.all([
    database
      .select()
      .from(views)
      .where(eq(views.userId, userId))
      .orderBy(asc(views.placement)),
    database.select().from(feeds).where(eq(feeds.userId, userId)),
    database
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, userId))
      .orderBy(asc(contentCategories.name)),
  ]);
  const view = viewRows.find((row) => row.id === viewId);
  if (!view) throw new Error(`Benchmark view ${viewId} does not exist`);

  const categoryIds = categoryRows.map((category) => category.id);
  const viewIds = viewRows.map((row) => row.id);
  const [feedTagRows, viewTagRows, viewFeedRows, sectionRows] =
    await Promise.all([
      categoryIds.length > 0
        ? database
            .select()
            .from(feedCategories)
            .where(inArray(feedCategories.categoryId, categoryIds))
        : Promise.resolve([]),
      viewIds.length > 0
        ? database
            .select()
            .from(viewCategories)
            .where(inArray(viewCategories.viewId, viewIds))
        : Promise.resolve([]),
      viewIds.length > 0
        ? database
            .select()
            .from(viewFeeds)
            .where(inArray(viewFeeds.viewId, viewIds))
        : Promise.resolve([]),
      viewIds.length > 0
        ? database
            .select()
            .from(viewSections)
            .where(inArray(viewSections.viewId, viewIds))
            .orderBy(asc(viewSections.placement))
        : Promise.resolve([]),
    ]);

  const hasAssignments =
    viewTagRows.some((row) => row.viewId === viewId) ||
    viewFeedRows.some((row) => row.viewId === viewId) ||
    sectionRows.some((row) => row.viewId === viewId);
  if (hasAssignments) {
    throw new Error(
      "The baseline adapter requires the fixture's unassigned all-content view",
    );
  }

  const feedIds = feedRows.map((feed) => feed.id);
  const visibilityFilter = buildVisibilityFilter(visibility);
  const where = and(inArray(feedItems.feedId, feedIds), visibilityFilter);
  const orderBy =
    visibility === "read"
      ? [
          desc(feedItems.isWatchedUpdatedAt),
          desc(feedItems.postedAt),
          desc(feedItems.id),
        ]
      : visibility === "later"
        ? [
            desc(feedItems.isWatchLaterUpdatedAt),
            desc(feedItems.postedAt),
            desc(feedItems.id),
          ]
        : [desc(feedItems.postedAt), desc(feedItems.id)];
  const rows = await database
    .select(feedItemColumns)
    .from(feedItems)
    .where(where)
    .orderBy(...orderBy)
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const feedsById = new Map(feedRows.map((feed) => [feed.id, feed]));

  return {
    items: pageRows.map((item) => ({
      ...item,
      platform: feedsById.get(item.feedId)?.platform ?? "youtube",
    })),
    hasMore,
    // Keep all prerequisite transformations in the timed operation. These
    // values are intentionally consumed so V8 cannot elide the work.
    prerequisiteCounts: {
      views: viewRows.length,
      feeds: feedRows.length,
      tags: categoryRows.length,
      feedTags: feedTagRows.length,
      viewTags: viewTagRows.length,
      viewFeeds: viewFeedRows.length,
      sections: sectionRows.length,
    },
  };
}

export async function queryMixedViewPage(input: {
  database: Database;
  userId: string;
  viewId: number;
  visibility: VisibilityFilter;
  limit: number;
}) {
  return queryMixedContentPage({
    database: input.database,
    userId: input.userId,
    scope: { type: "view", viewId: input.viewId },
    visibility: input.visibility,
    limit: input.limit,
  });
}
