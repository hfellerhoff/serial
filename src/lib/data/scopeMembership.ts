import { doesFeedItemPassFilters } from "./feed-items/clientFilters";
import { feedCategoriesStore } from "./feed-categories/store";
import { INBOX_VIEW_ID } from "./views/constants";
import { viewsStore } from "./views/store";
import type { VisibilityFilter } from "./atoms";
import type { DiffEntry } from "~/server/api/routers/initialRouter";
import type { ApplicationFeedItem } from "~/server/db/schema";

export type FeedItemScopeType = "view" | "feed" | "category";

export function getFeedItemScopeKey(
  scopeType: FeedItemScopeType,
  scopeId: number,
  visibilityFilter: VisibilityFilter,
) {
  return `${scopeType}:${scopeId}:${visibilityFilter}`;
}

function mergeScopeItemIds(
  existingIds: string[] | undefined,
  itemIds: string[],
) {
  const mergedIds = [...(existingIds ?? [])];
  const knownIds = new Set(mergedIds);

  for (const itemId of itemIds) {
    if (knownIds.has(itemId)) continue;
    mergedIds.push(itemId);
    knownIds.add(itemId);
  }

  return mergedIds;
}

export function getServerItemIdsFromDiff(diff: DiffEntry[]) {
  return diff.flatMap((entry) => {
    if (entry.status === "deleted") return [];
    if (entry.status === "unchanged") return [entry.id];
    return [entry.item.id];
  });
}

export function getChangedItemsFromDiff(diff: DiffEntry[]) {
  return diff.flatMap((entry) => {
    if (entry.status !== "new" && entry.status !== "updated") return [];
    return [entry.item];
  });
}

export function applyScopeMembershipUpdate({
  scopeFeedItemIds,
  scopeKey,
  itemIds,
  replace,
}: {
  scopeFeedItemIds: Record<string, string[]>;
  scopeKey: string;
  itemIds: string[];
  replace: boolean;
}) {
  return {
    ...scopeFeedItemIds,
    [scopeKey]: replace
      ? itemIds
      : mergeScopeItemIds(scopeFeedItemIds[scopeKey], itemIds),
  };
}

function parseFeedItemScopeKey(scopeKey: string):
  | {
      scopeType: FeedItemScopeType;
      scopeId: number;
      visibilityFilter: VisibilityFilter;
    }
  | undefined {
  const [scopeType, scopeIdValue, visibilityFilter] = scopeKey.split(":");
  const isKnownScope =
    scopeType === "view" || scopeType === "feed" || scopeType === "category";
  const isKnownVisibilityFilter =
    visibilityFilter === "unread" ||
    visibilityFilter === "read" ||
    visibilityFilter === "later";

  if (!isKnownScope || !isKnownVisibilityFilter) return undefined;

  const scopeId = Number(scopeIdValue);
  if (!Number.isFinite(scopeId)) return undefined;

  return { scopeType, scopeId, visibilityFilter };
}

function doesItemBelongToScope(
  item: ApplicationFeedItem,
  scope: {
    scopeType: FeedItemScopeType;
    scopeId: number;
    visibilityFilter: VisibilityFilter;
  },
) {
  const views = viewsStore.getState().views;
  const customViews = views.filter((view) => view.id !== INBOX_VIEW_ID);
  const customViewCategoryIds = new Set(
    customViews.flatMap((view) => view.categoryIds),
  );
  const customViewFeedIds = new Set(
    customViews.flatMap((view) => view.feedIds),
  );

  const viewFilter =
    scope.scopeType === "view"
      ? (viewsStore.getState().viewsDict[scope.scopeId] ?? null)
      : null;

  if (scope.scopeType === "view" && !viewFilter) return false;

  return doesFeedItemPassFilters({
    item,
    visibilityFilter: scope.visibilityFilter,
    categoryFilter: scope.scopeType === "category" ? scope.scopeId : -1,
    feedCategories: feedCategoriesStore.getState().feedCategories,
    feedFilter: scope.scopeType === "feed" ? scope.scopeId : -1,
    viewFilter,
    customViewCategoryIds,
    customViews,
    customViewFeedIds,
  });
}

export function reconcileScopeMembershipsForItem(
  scopeFeedItemIds: Record<string, string[]>,
  item: ApplicationFeedItem,
) {
  let nextScopeFeedItemIds = scopeFeedItemIds;

  for (const [scopeKey, scopedItemIds] of Object.entries(scopeFeedItemIds)) {
    const scope = parseFeedItemScopeKey(scopeKey);
    if (!scope) continue;

    const itemIsInScope = scopedItemIds.includes(item.id);
    const itemBelongsToScope = doesItemBelongToScope(item, scope);

    if (itemBelongsToScope && !itemIsInScope) {
      nextScopeFeedItemIds = applyScopeMembershipUpdate({
        scopeFeedItemIds: nextScopeFeedItemIds,
        scopeKey,
        itemIds: [item.id],
        replace: false,
      });
      continue;
    }

    if (!itemBelongsToScope && itemIsInScope) {
      nextScopeFeedItemIds = {
        ...nextScopeFeedItemIds,
        [scopeKey]: scopedItemIds.filter((itemId) => itemId !== item.id),
      };
    }
  }

  return nextScopeFeedItemIds;
}

export function reconcileScopeMembershipsForItems(
  scopeFeedItemIds: Record<string, string[]>,
  items: ApplicationFeedItem[],
) {
  return items.reduce(
    (nextScopeFeedItemIds, item) =>
      reconcileScopeMembershipsForItem(nextScopeFeedItemIds, item),
    scopeFeedItemIds,
  );
}
