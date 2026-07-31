import {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
} from "./feed-items/listProjection";
import { feedCategoriesStore } from "./feed-categories/store";
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

function reconcileScopeMemberships(
  scopeFeedItemIds: Record<string, string[]>,
  items: readonly ApplicationFeedItem[],
) {
  if (items.length === 0) return scopeFeedItemIds;

  const viewsState = viewsStore.getState();
  const filterIndex = createFeedItemFilterIndex(
    feedCategoriesStore.getState().feedCategories,
    viewsState.views,
  );
  let nextScopeFeedItemIds: Record<string, string[]> | undefined;

  for (const [scopeKey, scopedItemIds] of Object.entries(scopeFeedItemIds)) {
    const scope = parseFeedItemScopeKey(scopeKey);
    if (!scope) continue;

    const viewFilter =
      scope.scopeType === "view"
        ? (viewsState.viewsDict[scope.scopeId] ?? null)
        : null;
    if (scope.scopeType === "view" && !viewFilter) continue;

    const doesItemBelongToScope = createFeedItemFilterPredicate({
      visibilityFilter: scope.visibilityFilter,
      categoryFilter: scope.scopeType === "category" ? scope.scopeId : -1,
      feedFilter: scope.scopeType === "feed" ? scope.scopeId : -1,
      viewFilter,
      filterIndex,
    });
    const scopedItemIdSet = new Set(scopedItemIds);
    let nextScopedItemIds: string[] | undefined;

    for (const item of items) {
      const itemIsInScope = scopedItemIdSet.has(item.id);
      const itemBelongsToScope = doesItemBelongToScope(item);

      if (itemBelongsToScope === itemIsInScope) continue;

      nextScopedItemIds ??= [...scopedItemIds];

      if (itemBelongsToScope) {
        nextScopedItemIds.push(item.id);
        scopedItemIdSet.add(item.id);
      } else {
        const itemIndex = nextScopedItemIds.indexOf(item.id);
        if (itemIndex >= 0) nextScopedItemIds.splice(itemIndex, 1);
        scopedItemIdSet.delete(item.id);
      }
    }

    if (nextScopedItemIds) {
      nextScopeFeedItemIds ??= { ...scopeFeedItemIds };
      nextScopeFeedItemIds[scopeKey] = nextScopedItemIds;
    }
  }

  return nextScopeFeedItemIds ?? scopeFeedItemIds;
}

export function reconcileScopeMembershipsForItem(
  scopeFeedItemIds: Record<string, string[]>,
  item: ApplicationFeedItem,
) {
  return reconcileScopeMemberships(scopeFeedItemIds, [item]);
}

export function reconcileScopeMembershipsForItems(
  scopeFeedItemIds: Record<string, string[]>,
  items: readonly ApplicationFeedItem[],
) {
  return reconcileScopeMemberships(scopeFeedItemIds, items);
}
