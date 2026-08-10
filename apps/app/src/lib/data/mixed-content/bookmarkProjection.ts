import { UNCATEGORIZED_VIEW_ID } from "../views/constants";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentCursor,
  MixedContentReference,
  MixedContentScope,
} from "~/server/mixed-content/projection";
import type { ContentStatusFilter } from "~/lib/content-status";
import { buildContentStatusKey } from "~/lib/content-status";
import { contentFilterAllowsDescriptor } from "~/lib/views/contentFilter";

export type LoadedMixedScope = {
  scope: MixedContentScope;
  contentStatus: ContentStatusFilter;
  references: MixedContentReference[];
  cursor: MixedContentCursor;
  hasMore: boolean;
};

export type ProjectionIndexes = {
  bookmarkScopeKeys: Record<string, string[]>;
  feedItemScopeKeys: Record<string, string[]>;
};

export function getMixedScopeKey(
  scope: MixedContentScope,
  contentStatus: ContentStatusFilter,
) {
  const contentStatusKey = buildContentStatusKey(contentStatus);
  return scope.type === "view"
    ? `view:${scope.viewId}:${contentStatusKey}`
    : scope.type === "feed"
      ? `feed:${scope.feedId}:${contentStatusKey}`
      : `tag:${scope.tagId}:${contentStatusKey}`;
}

function compareReferences(
  left: MixedContentReference,
  right: MixedContentReference,
) {
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

export function uniqueReferences(references: MixedContentReference[]) {
  const byKey = new Map(
    references.map((reference) => [
      `${reference.entityKind}:${reference.entityId}`,
      reference,
    ]),
  );
  return [...byKey.values()].sort(compareReferences);
}

export function referencesEqual(
  left: MixedContentReference[],
  right: MixedContentReference[],
) {
  return (
    left.length === right.length &&
    left.every((reference, index) => {
      const candidate = right[index];
      return (
        candidate !== undefined &&
        reference.entityKind === candidate.entityKind &&
        reference.entityId === candidate.entityId &&
        reference.sectionPlacement === candidate.sectionPlacement &&
        reference.normalizedAt.getTime() === candidate.normalizedAt.getTime()
      );
    })
  );
}

export function emptyProjectionIndexes(): ProjectionIndexes {
  return {
    bookmarkScopeKeys: {},
    feedItemScopeKeys: {},
  };
}

function addUniqueValue(
  record: Record<string, string[]>,
  key: string,
  value: string,
) {
  const values = record[key] ?? [];
  if (!values.includes(value)) record[key] = [...values, value];
}

function removeValue(
  record: Record<string, string[]>,
  key: string,
  value: string,
) {
  const values = record[key];
  if (!values) return;
  const nextValues = values.filter((candidate) => candidate !== value);
  if (nextValues.length === 0) delete record[key];
  else record[key] = nextValues;
}

function removeScopeFromIndexes(
  indexes: ProjectionIndexes,
  scopeKey: string,
  references: MixedContentReference[],
) {
  for (const reference of references) {
    if (reference.entityKind === "bookmark") {
      removeValue(indexes.bookmarkScopeKeys, reference.entityId, scopeKey);
      continue;
    }

    removeValue(indexes.feedItemScopeKeys, reference.entityId, scopeKey);
  }
}

function addScopeToIndexes(
  indexes: ProjectionIndexes,
  scopeKey: string,
  references: MixedContentReference[],
) {
  for (const reference of references) {
    if (reference.entityKind === "bookmark") {
      addUniqueValue(indexes.bookmarkScopeKeys, reference.entityId, scopeKey);
      continue;
    }

    addUniqueValue(indexes.feedItemScopeKeys, reference.entityId, scopeKey);
  }
}

export function replaceScopeInIndexes(input: {
  indexes: ProjectionIndexes;
  scopeKey: string;
  previousReferences: MixedContentReference[];
  nextReferences: MixedContentReference[];
}) {
  const { indexes, scopeKey, previousReferences, nextReferences } = input;
  removeScopeFromIndexes(indexes, scopeKey, previousReferences);
  addScopeToIndexes(indexes, scopeKey, nextReferences);
}

export function buildProjectionIndexes(
  scopes: Record<string, LoadedMixedScope>,
) {
  const indexes = emptyProjectionIndexes();
  for (const [scopeKey, scope] of Object.entries(scopes)) {
    addScopeToIndexes(indexes, scopeKey, scope.references);
  }
  return indexes;
}

export function bookmarkContentStatus(
  bookmark: ApplicationBookmark,
): ContentStatusFilter {
  return {
    saveStatus: bookmark.isSaved ? "saved" : "inbox",
    archiveStatus: bookmark.isRead ? "archived" : "unread",
  };
}

function sameIds(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

export function isBookmarkProjectionChange(
  previousBookmark: ApplicationBookmark | undefined,
  bookmark: ApplicationBookmark,
) {
  if (!previousBookmark) return true;
  if (
    previousBookmark.contentType !== bookmark.contentType ||
    previousBookmark.orientation !== bookmark.orientation ||
    previousBookmark.isSaved !== bookmark.isSaved ||
    previousBookmark.isRead !== bookmark.isRead ||
    previousBookmark.createdAt.getTime() !== bookmark.createdAt.getTime() ||
    !sameIds(previousBookmark.viewIds, bookmark.viewIds) ||
    !sameIds(previousBookmark.tagIds, bookmark.tagIds)
  ) {
    return true;
  }

  const contentStatus = bookmarkContentStatus(bookmark);
  if (contentStatus.archiveStatus === "archived") {
    return (
      previousBookmark.readUpdatedAt.getTime() !==
      bookmark.readUpdatedAt.getTime()
    );
  }
  if (contentStatus.saveStatus === "saved") {
    return (
      previousBookmark.savedUpdatedAt.getTime() !==
      bookmark.savedUpdatedAt.getTime()
    );
  }
  return false;
}

function isBookmarkCompatibleWithView(view: ApplicationView) {
  return (bookmark: ApplicationBookmark) =>
    contentFilterAllowsDescriptor(view.contentFilter, bookmark);
}

type ViewMembershipIndex = {
  compatibleViewsById: Map<number, ApplicationView>;
  viewIdsByTagId: Map<number, number[]>;
};

let indexedViews: ApplicationView[] | undefined;
let cachedViewMembershipIndex: ViewMembershipIndex | undefined;

function getViewMembershipIndex(views: ApplicationView[]) {
  if (views === indexedViews && cachedViewMembershipIndex) {
    return cachedViewMembershipIndex;
  }
  const compatibleViews = views.filter(
    (view) => view.id !== UNCATEGORIZED_VIEW_ID,
  );
  const viewIdsByTagId = new Map<number, number[]>();
  for (const view of compatibleViews) {
    for (const tagId of view.categoryIds) {
      viewIdsByTagId.set(tagId, [
        ...(viewIdsByTagId.get(tagId) ?? []),
        view.id,
      ]);
    }
  }
  indexedViews = views;
  cachedViewMembershipIndex = {
    compatibleViewsById: new Map(
      compatibleViews.map((view) => [view.id, view]),
    ),
    viewIdsByTagId,
  };
  return cachedViewMembershipIndex;
}

function matchingCustomViewIds(
  bookmark: ApplicationBookmark,
  views: ApplicationView[],
) {
  const index = getViewMembershipIndex(views);
  const matchingIds = new Set<number>();
  for (const viewId of bookmark.viewIds) {
    const view = index.compatibleViewsById.get(viewId);
    if (view && isBookmarkCompatibleWithView(view)(bookmark)) {
      matchingIds.add(viewId);
    }
  }
  for (const tagId of bookmark.tagIds) {
    for (const viewId of index.viewIdsByTagId.get(tagId) ?? []) {
      const view = index.compatibleViewsById.get(viewId);
      if (view && isBookmarkCompatibleWithView(view)(bookmark)) {
        matchingIds.add(viewId);
      }
    }
  }
  return { index, matchingIds };
}

function isInsideTimeWindow(date: Date, daysWindow: number) {
  if (daysWindow <= 0) return true;
  return date.getTime() >= Date.now() - daysWindow * 24 * 60 * 60 * 1_000;
}

export function matchingLoadedScopeKeys(
  bookmark: ApplicationBookmark,
  scopes: Record<string, LoadedMixedScope>,
  views: ApplicationView[],
) {
  const contentStatus = bookmarkContentStatus(bookmark);
  const keys = new Set<string>();
  for (const tagId of bookmark.tagIds) {
    const key = getMixedScopeKey({ type: "tag", tagId }, contentStatus);
    if (scopes[key]) keys.add(key);
  }

  const { index, matchingIds } = matchingCustomViewIds(bookmark, views);
  for (const viewId of matchingIds) {
    const view = index.compatibleViewsById.get(viewId);
    if (!view) continue;
    if (!isInsideTimeWindow(bookmark.createdAt, view.daysWindow)) continue;
    const key = getMixedScopeKey(
      { type: "view", viewId: view.id },
      contentStatus,
    );
    if (scopes[key]) keys.add(key);
  }

  if (matchingIds.size === 0) {
    const uncategorizedKey = getMixedScopeKey(
      { type: "view", viewId: UNCATEGORIZED_VIEW_ID },
      contentStatus,
    );
    if (scopes[uncategorizedKey]) keys.add(uncategorizedKey);
  }
  return keys;
}

export function matchesScope(
  bookmark: ApplicationBookmark,
  scope: MixedContentScope,
  views: ApplicationView[],
) {
  if (scope.type === "feed") return false;
  if (scope.type === "tag") return bookmark.tagIds.includes(scope.tagId);
  const { index, matchingIds } = matchingCustomViewIds(bookmark, views);
  if (scope.viewId === UNCATEGORIZED_VIEW_ID) {
    return matchingIds.size === 0;
  }
  const view = index.compatibleViewsById.get(scope.viewId);
  return Boolean(
    view &&
    matchingIds.has(view.id) &&
    isInsideTimeWindow(bookmark.createdAt, view.daysWindow),
  );
}

function feedItemNormalizedAt(
  item: ApplicationFeedItem,
  contentStatus: ContentStatusFilter,
) {
  if (contentStatus.archiveStatus === "archived") {
    return item.isWatchedUpdatedAt ?? item.postedAt;
  }
  if (contentStatus.saveStatus === "saved") {
    return item.isWatchLaterUpdatedAt ?? item.postedAt;
  }
  return item.postedAt;
}

function bookmarkNormalizedAt(
  bookmark: ApplicationBookmark,
  contentStatus: ContentStatusFilter,
) {
  if (contentStatus.archiveStatus === "archived") {
    return bookmark.readUpdatedAt;
  }
  if (contentStatus.saveStatus === "saved") return bookmark.savedUpdatedAt;
  return bookmark.createdAt;
}

function localSectionPlacement(input: {
  entityKind: "bookmark" | "feed-item";
  feedId?: number;
  tagIds?: number[];
  view: ApplicationView | undefined;
  categoryIdsByFeedId: ReadonlyMap<number, ReadonlySet<number>>;
}) {
  const { entityKind, feedId, tagIds, view, categoryIdsByFeedId } = input;
  if (!view?.viewSections.length) return 0;

  if (entityKind === "feed-item" && feedId !== undefined) {
    const feedPlacements = view.viewSections.flatMap((section) =>
      section.itemType === "feed" && section.itemId === feedId
        ? [section.placement]
        : [],
    );
    if (feedPlacements.length > 0) return Math.min(...feedPlacements);

    const feedTagIds = categoryIdsByFeedId.get(feedId);
    const tagPlacements = view.viewSections.flatMap((section) =>
      section.itemType === "tag" && feedTagIds?.has(section.itemId)
        ? [section.placement]
        : [],
    );
    return tagPlacements.length > 0 ? Math.min(...tagPlacements) : 999_999;
  }

  const bookmarkTagIds = new Set(tagIds ?? []);
  const tagPlacements = view.viewSections.flatMap((section) =>
    section.itemType === "tag" && bookmarkTagIds.has(section.itemId)
      ? [section.placement]
      : [],
  );
  return tagPlacements.length > 0 ? Math.min(...tagPlacements) : 999_999;
}

export function projectLocalMixedContentOrder(input: {
  feedItemIds: string[];
  feedItems: Record<string, ApplicationFeedItem>;
  bookmarks: Record<string, ApplicationBookmark>;
  scope: MixedContentScope;
  views: ApplicationView[];
  contentStatus: ContentStatusFilter;
  feedCategories?: DatabaseFeedCategory[];
}) {
  const {
    feedItemIds,
    feedItems,
    bookmarks,
    scope,
    views,
    contentStatus,
    feedCategories = [],
  } = input;
  const bookmarkValues = Object.values(bookmarks);
  const view =
    scope.type === "view"
      ? views.find((candidate) => candidate.id === scope.viewId)
      : undefined;
  const categoryIdsByFeedId = new Map<number, Set<number>>();
  for (const assignment of feedCategories) {
    const categoryIds = categoryIdsByFeedId.get(assignment.feedId);
    if (categoryIds) categoryIds.add(assignment.categoryId);
    else
      categoryIdsByFeedId.set(
        assignment.feedId,
        new Set([assignment.categoryId]),
      );
  }
  const entries: Array<{
    id: string;
    entityKind: "bookmark" | "feed-item";
    normalizedAt: Date;
    sectionPlacement: number;
  }> = [];

  for (const id of feedItemIds) {
    const item = feedItems[id];
    if (!item) continue;
    entries.push({
      id,
      entityKind: "feed-item",
      normalizedAt: feedItemNormalizedAt(item, contentStatus),
      sectionPlacement: localSectionPlacement({
        entityKind: "feed-item",
        feedId: item.feedId,
        view,
        categoryIdsByFeedId,
      }),
    });
  }
  for (const bookmark of bookmarkValues) {
    if (
      buildContentStatusKey(bookmarkContentStatus(bookmark)) !==
      buildContentStatusKey(contentStatus)
    ) {
      continue;
    }
    if (!matchesScope(bookmark, scope, views)) continue;
    entries.push({
      id: bookmark.id,
      entityKind: "bookmark",
      normalizedAt: bookmarkNormalizedAt(bookmark, contentStatus),
      sectionPlacement: localSectionPlacement({
        entityKind: "bookmark",
        tagIds: bookmark.tagIds,
        view,
        categoryIdsByFeedId,
      }),
    });
  }

  entries.sort((left, right) => {
    if (left.sectionPlacement !== right.sectionPlacement) {
      return left.sectionPlacement - right.sectionPlacement;
    }
    const timeDifference =
      right.normalizedAt.getTime() - left.normalizedAt.getTime();
    if (timeDifference !== 0) return timeDifference;
    const kindDifference = left.entityKind.localeCompare(right.entityKind);
    if (kindDifference !== 0) return kindDifference;
    return right.id.localeCompare(left.id);
  });
  return entries.map(({ id }) => id);
}

export function bookmarkReference(
  bookmark: ApplicationBookmark,
  scopeState: LoadedMixedScope,
  views: ApplicationView[],
): MixedContentReference {
  const scope = scopeState.scope;
  const bookmarkTagIds = new Set(bookmark.tagIds);
  const view =
    scope.type === "view"
      ? views.find((candidate) => candidate.id === scope.viewId)
      : undefined;
  const hasSections = (view?.viewSections.length ?? 0) > 0;
  const matchingPlacements =
    view?.viewSections
      .filter(
        (section) =>
          section.itemType === "tag" && bookmarkTagIds.has(section.itemId),
      )
      .map((section) => section.placement) ?? [];
  const normalizedAt = bookmarkNormalizedAt(bookmark, scopeState.contentStatus);
  return {
    entityKind: "bookmark",
    entityId: bookmark.id,
    sectionPlacement: hasSections
      ? matchingPlacements.length > 0
        ? Math.min(...matchingPlacements)
        : 999_999
      : null,
    normalizedAt,
  };
}
