import { INBOX_VIEW_ID } from "../views/constants";
import type { VisibilityFilter } from "../atoms";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentCursor,
  MixedContentReference,
  MixedContentScope,
} from "~/server/mixed-content/projection";

export type LoadedMixedScope = {
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  references: MixedContentReference[];
  cursor: MixedContentCursor;
  hasMore: boolean;
};

export type ProjectionIndexes = {
  bookmarkScopeKeys: Record<string, string[]>;
  feedItemScopeKeys: Record<string, string[]>;
  canonicalByFeedItemId: Record<string, string>;
  feedItemIdsByCanonical: Record<string, string[]>;
};

export function getMixedScopeKey(
  scope: MixedContentScope,
  visibility: VisibilityFilter,
) {
  return scope.type === "view"
    ? `view:${scope.viewId}:${visibility}`
    : `tag:${scope.tagId}:${visibility}`;
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

export function referenceRecordsEqual(
  left: Record<string, MixedContentReference[]>,
  right: Record<string, MixedContentReference[]>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        right[key] !== undefined && referencesEqual(left[key]!, right[key]),
    )
  );
}

export function emptyProjectionIndexes(): ProjectionIndexes {
  return {
    bookmarkScopeKeys: {},
    feedItemScopeKeys: {},
    canonicalByFeedItemId: {},
    feedItemIdsByCanonical: {},
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

export function canonicalize(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.protocol === "http:" && parsed.port === "80") parsed.port = "";
    if (parsed.protocol === "https:" && parsed.port === "443") parsed.port = "";
    return parsed.toString();
  } catch {
    return url;
  }
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
    if (indexes.feedItemScopeKeys[reference.entityId] !== undefined) continue;
    const canonicalUrl = indexes.canonicalByFeedItemId[reference.entityId];
    delete indexes.canonicalByFeedItemId[reference.entityId];
    if (canonicalUrl) {
      removeValue(
        indexes.feedItemIdsByCanonical,
        canonicalUrl,
        reference.entityId,
      );
    }
  }
}

function addScopeToIndexes(
  indexes: ProjectionIndexes,
  scopeKey: string,
  references: MixedContentReference[],
  feedItems: Record<string, ApplicationFeedItem>,
) {
  for (const reference of references) {
    if (reference.entityKind === "bookmark") {
      addUniqueValue(indexes.bookmarkScopeKeys, reference.entityId, scopeKey);
      continue;
    }

    addUniqueValue(indexes.feedItemScopeKeys, reference.entityId, scopeKey);
    const item = feedItems[reference.entityId];
    if (!item?.url) continue;
    const canonicalUrl = canonicalize(item.url);
    const previousCanonical = indexes.canonicalByFeedItemId[reference.entityId];
    if (previousCanonical && previousCanonical !== canonicalUrl) {
      removeValue(
        indexes.feedItemIdsByCanonical,
        previousCanonical,
        reference.entityId,
      );
    }
    indexes.canonicalByFeedItemId[reference.entityId] = canonicalUrl;
    addUniqueValue(
      indexes.feedItemIdsByCanonical,
      canonicalUrl,
      reference.entityId,
    );
  }
}

export function replaceScopeInIndexes(input: {
  indexes: ProjectionIndexes;
  scopeKey: string;
  previousReferences: MixedContentReference[];
  nextReferences: MixedContentReference[];
  feedItems: Record<string, ApplicationFeedItem>;
}) {
  const { indexes, scopeKey, previousReferences, nextReferences, feedItems } =
    input;
  removeScopeFromIndexes(indexes, scopeKey, previousReferences);
  addScopeToIndexes(indexes, scopeKey, nextReferences, feedItems);
}

export function buildProjectionIndexes(
  scopes: Record<string, LoadedMixedScope>,
  feedItems: Record<string, ApplicationFeedItem>,
) {
  const indexes = emptyProjectionIndexes();
  for (const [scopeKey, scope] of Object.entries(scopes)) {
    addScopeToIndexes(indexes, scopeKey, scope.references, feedItems);
  }
  return indexes;
}

export function bookmarkVisibility(
  bookmark: ApplicationBookmark,
): VisibilityFilter {
  if (bookmark.isSaved) return "later";
  return bookmark.isRead ? "read" : "unread";
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
    previousBookmark.canonicalUrl !== bookmark.canonicalUrl ||
    previousBookmark.isSaved !== bookmark.isSaved ||
    previousBookmark.isRead !== bookmark.isRead ||
    previousBookmark.createdAt.getTime() !== bookmark.createdAt.getTime() ||
    !sameIds(previousBookmark.viewIds, bookmark.viewIds) ||
    !sameIds(previousBookmark.tagIds, bookmark.tagIds)
  ) {
    return true;
  }

  const visibility = bookmarkVisibility(bookmark);
  if (visibility === "later") {
    return (
      previousBookmark.savedUpdatedAt.getTime() !==
      bookmark.savedUpdatedAt.getTime()
    );
  }
  if (visibility === "read") {
    return (
      previousBookmark.readUpdatedAt.getTime() !==
      bookmark.readUpdatedAt.getTime()
    );
  }
  return false;
}

function isBookmarkCompatibleWithView(view: ApplicationView) {
  return view.contentType === "all" || view.contentType === "longform";
}

type ViewMembershipIndex = {
  compatibleViewsById: Map<number, ApplicationView>;
  viewIdsByTagId: Map<number, number[]>;
  catchAllViewIds: number[];
};

let indexedViews: ApplicationView[] | undefined;
let cachedViewMembershipIndex: ViewMembershipIndex | undefined;

function getViewMembershipIndex(views: ApplicationView[]) {
  if (views === indexedViews && cachedViewMembershipIndex) {
    return cachedViewMembershipIndex;
  }
  const compatibleViews = views.filter(
    (view) => view.id !== INBOX_VIEW_ID && isBookmarkCompatibleWithView(view),
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
    catchAllViewIds: compatibleViews
      .filter(
        (view) => view.feedIds.length === 0 && view.categoryIds.length === 0,
      )
      .map((view) => view.id),
  };
  return cachedViewMembershipIndex;
}

function matchingCustomViewIds(
  bookmark: ApplicationBookmark,
  views: ApplicationView[],
) {
  const index = getViewMembershipIndex(views);
  const matchingIds = new Set(index.catchAllViewIds);
  for (const viewId of bookmark.viewIds) {
    if (index.compatibleViewsById.has(viewId)) matchingIds.add(viewId);
  }
  for (const tagId of bookmark.tagIds) {
    for (const viewId of index.viewIdsByTagId.get(tagId) ?? []) {
      matchingIds.add(viewId);
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
  const visibility = bookmarkVisibility(bookmark);
  const keys = new Set<string>();
  for (const tagId of bookmark.tagIds) {
    const key = getMixedScopeKey({ type: "tag", tagId }, visibility);
    if (scopes[key]) keys.add(key);
  }

  const { index, matchingIds } = matchingCustomViewIds(bookmark, views);
  for (const viewId of matchingIds) {
    const view = index.compatibleViewsById.get(viewId);
    if (!view) continue;
    if (!isInsideTimeWindow(bookmark.createdAt, view.daysWindow)) continue;
    const key = getMixedScopeKey({ type: "view", viewId: view.id }, visibility);
    if (scopes[key]) keys.add(key);
  }

  if (matchingIds.size === 0) {
    const inboxKey = getMixedScopeKey(
      { type: "view", viewId: INBOX_VIEW_ID },
      visibility,
    );
    if (scopes[inboxKey]) keys.add(inboxKey);
  }
  return keys;
}

export function matchesScope(
  bookmark: ApplicationBookmark,
  scope: MixedContentScope,
  views: ApplicationView[],
) {
  if (scope.type === "tag") return bookmark.tagIds.includes(scope.tagId);
  const { index, matchingIds } = matchingCustomViewIds(bookmark, views);
  if (scope.viewId === INBOX_VIEW_ID) {
    return matchingIds.size === 0;
  }
  const view = index.compatibleViewsById.get(scope.viewId);
  return Boolean(
    view &&
    matchingIds.has(view.id) &&
    isInsideTimeWindow(bookmark.createdAt, view.daysWindow),
  );
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
  const hasSections =
    scopeState.visibility !== "read" && (view?.viewSections.length ?? 0) > 0;
  const matchingPlacements =
    view?.viewSections
      .filter(
        (section) =>
          section.itemType === "tag" && bookmarkTagIds.has(section.itemId),
      )
      .map((section) => section.placement) ?? [];
  const normalizedAt =
    scopeState.visibility === "later"
      ? bookmark.savedUpdatedAt
      : scopeState.visibility === "read"
        ? bookmark.readUpdatedAt
        : bookmark.createdAt;
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

export function collisionScopeKeys(
  canonicalUrl: string,
  indexes: ProjectionIndexes,
) {
  const keys = new Set<string>();
  for (const feedItemId of indexes.feedItemIdsByCanonical[
    canonicalize(canonicalUrl)
  ] ?? []) {
    for (const key of indexes.feedItemScopeKeys[feedItemId] ?? [])
      keys.add(key);
  }
  return keys;
}
