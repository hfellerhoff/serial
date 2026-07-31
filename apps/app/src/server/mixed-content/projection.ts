import { asc, eq, getTableColumns, inArray } from "drizzle-orm";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { db as defaultDatabase } from "~/server/db";
import type {
  ApplicationFeedItem,
  DatabaseBookmark,
  DatabaseFeed,
  DatabaseView,
  DatabaseViewSection,
} from "~/server/db/schema";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  pageCaptures,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { normalizeBookmarkUrl } from "~/server/bookmarks/url";

const UNCATEGORIZED_SECTION_PLACEMENT = 999_999;
const VIDEO_PLATFORMS = new Set(["youtube", "peertube", "nebula"]);

type MixedContentDatabase = typeof defaultDatabase;

export type MixedContentScope =
  { type: "view"; viewId: number } | { type: "tag"; tagId: number };

export type MixedContentEntityKind = "bookmark" | "feed-item";

export type MixedContentCursor = {
  sectionPlacement: number | null;
  normalizedAt: Date;
  entityKind: MixedContentEntityKind;
  entityId: string;
} | null;

export type ApplicationBookmark = DatabaseBookmark & {
  title: string;
  author: string | null;
  publishedAt: Date | null;
  effectiveUrl: string | null;
  iconUrl: string | null;
  representativeImageUrl: string | null;
  captureHash: string | null;
  capturedAt: Date | null;
  viewIds: number[];
  tagIds: number[];
};

export type MixedContentReference = {
  entityKind: MixedContentEntityKind;
  entityId: string;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type MixedContentPage = {
  references: MixedContentReference[];
  bookmarks: ApplicationBookmark[];
  feedItems: ApplicationFeedItem[];
  cursor: MixedContentCursor;
  hasMore: boolean;
};

type ViewDefinition = DatabaseView & {
  categoryIds: number[];
  feedIds: number[];
  categoryIdSet: Set<number>;
  feedIdSet: Set<number>;
  sections: DatabaseViewSection[];
};

type FeedCandidate = {
  entityKind: "feed-item";
  entityId: string;
  item: ApplicationFeedItem;
  canonicalUrl: string | null;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

type BookmarkCandidate = {
  entityKind: "bookmark";
  entityId: string;
  item: ApplicationBookmark;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

type Candidate = FeedCandidate | BookmarkCandidate;

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function canonicalizeFeedItemUrl(url: string) {
  try {
    return normalizeBookmarkUrl(url);
  } catch {
    return null;
  }
}

function isBookmarkVisible(
  bookmark: ApplicationBookmark,
  visibility: VisibilityFilter,
) {
  if (visibility === "later") return bookmark.isSaved;
  if (bookmark.isSaved) return false;
  return visibility === "read" ? bookmark.isRead : !bookmark.isRead;
}

function isFeedItemVisible(
  item: ApplicationFeedItem,
  visibility: VisibilityFilter,
) {
  if (visibility === "later") return item.isWatchLater;
  if (item.isWatchLater) return false;
  return visibility === "read" ? item.isWatched : !item.isWatched;
}

function isFeedCompatibleWithView(feed: DatabaseFeed, view: DatabaseView) {
  if (view.contentType === "all" || view.contentType === "longform") {
    return true;
  }
  return VIDEO_PLATFORMS.has(feed.platform);
}

function doesFeedItemMatchContentType(
  item: ApplicationFeedItem,
  view: DatabaseView,
) {
  if (view.contentType === "all") return true;
  if (view.contentType === "longform") return item.orientation !== "vertical";
  if (!VIDEO_PLATFORMS.has(item.platform)) return false;
  return view.contentType === "vertical-video"
    ? item.orientation === "vertical"
    : item.orientation === "horizontal";
}

function isBookmarkCompatibleWithView(view: DatabaseView) {
  return view.contentType === "all" || view.contentType === "longform";
}

function isInsideTimeWindow(date: Date, daysWindow: number) {
  if (daysWindow <= 0) return true;
  return date.getTime() >= Date.now() - daysWindow * 24 * 60 * 60 * 1_000;
}

function feedBelongsToCustomView(input: {
  feed: DatabaseFeed;
  feedTagIds: Set<number>;
  view: ViewDefinition;
}) {
  const { feed, feedTagIds, view } = input;
  if (!isFeedCompatibleWithView(feed, view)) return false;
  if (view.feedIdSet.has(feed.id)) return true;
  if (
    [...view.categoryIdSet].some((categoryId) => feedTagIds.has(categoryId))
  ) {
    return true;
  }
  return view.feedIds.length === 0 && view.categoryIds.length === 0;
}

function bookmarkBelongsToCustomView(
  bookmarkTagIds: Set<number>,
  bookmarkViewIds: Set<number>,
  view: ViewDefinition,
) {
  if (!isBookmarkCompatibleWithView(view)) return false;
  if (bookmarkViewIds.has(view.id)) return true;
  if (
    [...view.categoryIdSet].some((categoryId) => bookmarkTagIds.has(categoryId))
  ) {
    return true;
  }
  return view.feedIds.length === 0 && view.categoryIds.length === 0;
}

function feedBelongsToScope(input: {
  item: ApplicationFeedItem;
  feed: DatabaseFeed;
  feedTagIds: Set<number>;
  scope: MixedContentScope;
  targetView: ViewDefinition | null;
  customViews: ViewDefinition[];
}) {
  const { item, feed, feedTagIds, scope, targetView, customViews } = input;
  if (scope.type === "tag") return feedTagIds.has(scope.tagId);
  if (scope.viewId === INBOX_VIEW_ID) {
    return !customViews.some((view) =>
      feedBelongsToCustomView({ feed, feedTagIds, view }),
    );
  }
  if (!targetView) return false;
  return (
    feedBelongsToCustomView({ feed, feedTagIds, view: targetView }) &&
    doesFeedItemMatchContentType(item, targetView) &&
    isInsideTimeWindow(item.postedAt, targetView.daysWindow)
  );
}

function bookmarkBelongsToScope(input: {
  bookmark: ApplicationBookmark;
  bookmarkTagIds: Set<number>;
  bookmarkViewIds: Set<number>;
  scope: MixedContentScope;
  targetView: ViewDefinition | null;
  customViews: ViewDefinition[];
}) {
  const {
    bookmark,
    bookmarkTagIds,
    bookmarkViewIds,
    scope,
    targetView,
    customViews,
  } = input;
  if (scope.type === "tag") return bookmarkTagIds.has(scope.tagId);
  if (scope.viewId === INBOX_VIEW_ID) {
    return !customViews.some((view) =>
      bookmarkBelongsToCustomView(bookmarkTagIds, bookmarkViewIds, view),
    );
  }
  if (!targetView) return false;
  return (
    bookmarkBelongsToCustomView(bookmarkTagIds, bookmarkViewIds, targetView) &&
    isInsideTimeWindow(bookmark.createdAt, targetView.daysWindow)
  );
}

function sectionPlacementForFeed(
  item: ApplicationFeedItem,
  feedTagIds: Set<number>,
  sections: DatabaseViewSection[],
) {
  let feedPlacement = Infinity;
  let tagPlacement = Infinity;
  for (const section of sections) {
    if (section.itemType === "feed" && section.itemId === item.feedId) {
      feedPlacement = Math.min(feedPlacement, section.placement);
    }
    if (section.itemType === "tag" && feedTagIds.has(section.itemId)) {
      tagPlacement = Math.min(tagPlacement, section.placement);
    }
  }
  if (feedPlacement !== Infinity) return feedPlacement;
  if (tagPlacement !== Infinity) return tagPlacement;
  return UNCATEGORIZED_SECTION_PLACEMENT;
}

function sectionPlacementForBookmark(
  bookmarkTagIds: Set<number>,
  sections: DatabaseViewSection[],
) {
  const placements = sections
    .filter(
      (section) =>
        section.itemType === "tag" && bookmarkTagIds.has(section.itemId),
    )
    .map((section) => section.placement);
  return placements.length > 0
    ? Math.min(...placements)
    : UNCATEGORIZED_SECTION_PLACEMENT;
}

function normalizedFeedTime(
  item: ApplicationFeedItem,
  visibility: VisibilityFilter,
) {
  if (visibility === "later")
    return item.isWatchLaterUpdatedAt ?? item.postedAt;
  if (visibility === "read") return item.isWatchedUpdatedAt ?? item.postedAt;
  return item.postedAt;
}

function normalizedBookmarkTime(
  bookmark: ApplicationBookmark,
  visibility: VisibilityFilter,
) {
  if (visibility === "later") return bookmark.savedUpdatedAt;
  if (visibility === "read") return bookmark.readUpdatedAt;
  return bookmark.createdAt;
}

function compareCandidates(left: Candidate, right: Candidate) {
  const leftPlacement = left.sectionPlacement ?? 0;
  const rightPlacement = right.sectionPlacement ?? 0;
  if (leftPlacement !== rightPlacement) return leftPlacement - rightPlacement;

  const timeDifference =
    right.normalizedAt.getTime() - left.normalizedAt.getTime();
  if (timeDifference !== 0) return timeDifference;

  const kindDifference = left.entityKind.localeCompare(right.entityKind);
  if (kindDifference !== 0) return kindDifference;
  return right.entityId.localeCompare(left.entityId);
}

function candidateFromCursor(
  cursor: NonNullable<MixedContentCursor>,
): Candidate {
  const shared = {
    entityId: cursor.entityId,
    sectionPlacement: cursor.sectionPlacement,
    normalizedAt: cursor.normalizedAt,
  };
  return cursor.entityKind === "bookmark"
    ? {
        ...shared,
        entityKind: "bookmark",
        item: {} as ApplicationBookmark,
      }
    : {
        ...shared,
        entityKind: "feed-item",
        item: {} as ApplicationFeedItem,
        canonicalUrl: null,
      };
}

export async function loadApplicationBookmarks(input: {
  database: MixedContentDatabase;
  userId: string;
}): Promise<ApplicationBookmark[]> {
  const { database, userId } = input;
  const bookmarkRows = await database
    .select({
      bookmark: getTableColumns(bookmarks),
      capture: getTableColumns(pageCaptures),
    })
    .from(bookmarks)
    .leftJoin(pageCaptures, eq(pageCaptures.bookmarkId, bookmarks.id))
    .where(eq(bookmarks.userId, userId));
  const bookmarkIds = bookmarkRows.map(({ bookmark }) => bookmark.id);
  const [viewRows, tagRows] =
    bookmarkIds.length === 0
      ? [[], []]
      : await Promise.all([
          database
            .select()
            .from(bookmarkViews)
            .where(inArray(bookmarkViews.bookmarkId, bookmarkIds)),
          database
            .select()
            .from(bookmarkTags)
            .where(inArray(bookmarkTags.bookmarkId, bookmarkIds)),
        ]);

  return bookmarkRows.map(({ bookmark, capture }) => ({
    ...bookmark,
    title: capture?.title || titleFromUrl(bookmark.sourceUrl),
    author: capture?.author ?? null,
    publishedAt: capture?.publishedAt ?? null,
    effectiveUrl: capture?.effectiveUrl ?? null,
    iconUrl: capture?.iconUrl ?? null,
    representativeImageUrl: capture?.representativeImageUrl ?? null,
    captureHash: capture?.contentHash ?? null,
    capturedAt: capture?.capturedAt ?? null,
    viewIds: viewRows
      .filter((row) => row.bookmarkId === bookmark.id)
      .map((row) => row.viewId)
      .sort((left, right) => left - right),
    tagIds: tagRows
      .filter((row) => row.bookmarkId === bookmark.id)
      .map((row) => row.tagId)
      .sort((left, right) => left - right),
  }));
}

async function loadProjectionData(
  database: MixedContentDatabase,
  userId: string,
) {
  const [feedRows, bookmarkList, viewRows, categoryRows] = await Promise.all([
    database
      .select({
        item: getTableColumns(feedItems),
        feed: getTableColumns(feeds),
      })
      .from(feedItems)
      .innerJoin(feeds, eq(feedItems.feedId, feeds.id))
      .where(eq(feeds.userId, userId)),
    loadApplicationBookmarks({ database, userId }),
    database
      .select()
      .from(views)
      .where(eq(views.userId, userId))
      .orderBy(asc(views.placement)),
    database
      .select()
      .from(contentCategories)
      .where(eq(contentCategories.userId, userId)),
  ]);
  const feedIds = [...new Set(feedRows.map(({ feed }) => feed.id))];
  const viewIds = viewRows.map((view) => view.id);
  const categoryIds = categoryRows.map((category) => category.id);
  const [feedTagRows, viewTagRows, viewFeedRows, sectionRows] =
    await Promise.all([
      feedIds.length > 0
        ? database
            .select()
            .from(feedCategories)
            .where(inArray(feedCategories.feedId, feedIds))
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
        : Promise.resolve([]),
    ]);

  const validCategoryIds = new Set(categoryIds);
  const customViews: ViewDefinition[] = viewRows.map((view) => {
    const viewCategoryIds = viewTagRows
      .filter((row) => row.viewId === view.id && row.categoryId !== null)
      .map((row) => row.categoryId!)
      .filter((id) => validCategoryIds.has(id));
    const viewFeedIds = viewFeedRows
      .filter((row) => row.viewId === view.id)
      .map((row) => row.feedId);
    return {
      ...view,
      categoryIds: viewCategoryIds,
      feedIds: viewFeedIds,
      categoryIdSet: new Set(viewCategoryIds),
      feedIdSet: new Set(viewFeedIds),
      sections: sectionRows
        .filter((row) => row.viewId === view.id)
        .sort((left, right) => left.placement - right.placement),
    };
  });

  return { feedRows, bookmarkList, customViews, feedTagRows };
}

export async function queryMixedContentPage(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  cursor?: MixedContentCursor;
  limit: number;
}): Promise<MixedContentPage> {
  const { database, userId, scope, visibility, limit } = input;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Mixed-content page limit must be between 1 and 500");
  }

  const { feedRows, bookmarkList, customViews, feedTagRows } =
    await loadProjectionData(database, userId);
  const targetView =
    scope.type === "view" && scope.viewId !== INBOX_VIEW_ID
      ? (customViews.find((view) => view.id === scope.viewId) ?? null)
      : null;
  const hasSections =
    visibility !== "read" &&
    scope.type === "view" &&
    targetView !== null &&
    targetView.sections.length > 0;
  const canonicalBookmarks = new Set(
    bookmarkList.map((bookmark) => bookmark.canonicalUrl),
  );
  const candidates: Candidate[] = [];

  for (const bookmark of bookmarkList) {
    if (!isBookmarkVisible(bookmark, visibility)) continue;
    const bookmarkTagIds = new Set(bookmark.tagIds);
    const bookmarkViewIds = new Set(bookmark.viewIds);
    if (
      !bookmarkBelongsToScope({
        bookmark,
        bookmarkTagIds,
        bookmarkViewIds,
        scope,
        targetView,
        customViews,
      })
    ) {
      continue;
    }
    candidates.push({
      entityKind: "bookmark",
      entityId: bookmark.id,
      item: bookmark,
      normalizedAt: normalizedBookmarkTime(bookmark, visibility),
      sectionPlacement: hasSections
        ? sectionPlacementForBookmark(bookmarkTagIds, targetView.sections)
        : null,
    });
  }

  for (const { item, feed } of feedRows) {
    const canonicalUrl = canonicalizeFeedItemUrl(item.url);
    if (canonicalUrl && canonicalBookmarks.has(canonicalUrl)) continue;
    const applicationItem = {
      ...item,
      platform: feed.platform,
    } as ApplicationFeedItem;
    if (!isFeedItemVisible(applicationItem, visibility)) continue;
    const feedTagIds = new Set(
      feedTagRows
        .filter((row) => row.feedId === feed.id)
        .map((row) => row.categoryId),
    );
    if (
      !feedBelongsToScope({
        item: applicationItem,
        feed,
        feedTagIds,
        scope,
        targetView,
        customViews,
      })
    ) {
      continue;
    }
    candidates.push({
      entityKind: "feed-item",
      entityId: item.id,
      item: applicationItem,
      canonicalUrl,
      normalizedAt: normalizedFeedTime(applicationItem, visibility),
      sectionPlacement: hasSections
        ? sectionPlacementForFeed(
            applicationItem,
            feedTagIds,
            targetView.sections,
          )
        : null,
    });
  }

  candidates.sort(compareCandidates);
  const cursorCandidate = input.cursor
    ? candidateFromCursor(input.cursor)
    : null;
  const afterCursor = cursorCandidate
    ? candidates.filter(
        (candidate) => compareCandidates(candidate, cursorCandidate) > 0,
      )
    : candidates;
  const hasMore = afterCursor.length > limit;
  const pageCandidates = afterCursor.slice(0, limit);
  const lastCandidate = pageCandidates.at(-1);
  const cursor: MixedContentCursor =
    hasMore && lastCandidate
      ? {
          sectionPlacement: lastCandidate.sectionPlacement,
          normalizedAt: lastCandidate.normalizedAt,
          entityKind: lastCandidate.entityKind,
          entityId: lastCandidate.entityId,
        }
      : null;

  return {
    references: pageCandidates.map((candidate) => ({
      entityKind: candidate.entityKind,
      entityId: candidate.entityId,
      sectionPlacement: candidate.sectionPlacement,
      normalizedAt: candidate.normalizedAt,
    })),
    bookmarks: pageCandidates
      .filter(
        (candidate): candidate is BookmarkCandidate =>
          candidate.entityKind === "bookmark",
      )
      .map((candidate) => candidate.item),
    feedItems: pageCandidates
      .filter(
        (candidate): candidate is FeedCandidate =>
          candidate.entityKind === "feed-item",
      )
      .map((candidate) => candidate.item),
    cursor,
    hasMore,
  };
}
