"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  categoryFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import {
  useCategoryPaginationState,
  useFeedPaginationState,
  useFetchMoreItems,
  useFetchMoreItemsForCategory,
  useFetchMoreItemsForFeed,
  useViewPaginationState,
} from "~/lib/data/store";
import {
  getMixedScopeKey,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";

export function useLoadMoreItems() {
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const currentView = useAtomValue(viewFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  const viewPaginationState = useViewPaginationState();
  const feedPaginationState = useFeedPaginationState();
  const categoryPaginationState = useCategoryPaginationState();
  const mixedScopes = mixedContentStore.useScopes();
  const fetchingMixedScopes = mixedContentStore.useFetchingScopes();

  const fetchMoreItems = useFetchMoreItems();
  const fetchMoreItemsForFeed = useFetchMoreItemsForFeed();
  const fetchMoreItemsForCategory = useFetchMoreItemsForCategory();

  const activeFilterType =
    feedFilter >= 0 ? "feed" : categoryFilter >= 0 ? "category" : "view";

  const viewId = currentView?.id;
  let paginationKey: string;
  switch (activeFilterType) {
    case "feed":
      paginationKey = `feed:${feedFilter}:${visibilityFilter}`;
      break;
    case "category":
      paginationKey = `category:${categoryFilter}:${visibilityFilter}`;
      break;
    default:
      paginationKey = `view:${viewId ?? "none"}:${visibilityFilter}`;
  }

  const paginationState = useMemo(() => {
    switch (activeFilterType) {
      case "feed":
        return feedPaginationState[feedFilter]?.[visibilityFilter];
      case "category":
        return categoryPaginationState[categoryFilter]?.[visibilityFilter];
      default:
        return viewId
          ? viewPaginationState[viewId]?.[visibilityFilter]
          : undefined;
    }
  }, [
    activeFilterType,
    feedFilter,
    categoryFilter,
    viewId,
    visibilityFilter,
    feedPaginationState,
    categoryPaginationState,
    viewPaginationState,
  ]);

  const mixedScope = useMemo(
    () =>
      activeFilterType === "category"
        ? ({ type: "tag", tagId: categoryFilter } as const)
        : activeFilterType === "view" && viewId !== undefined
          ? ({ type: "view", viewId } as const)
          : null,
    [activeFilterType, categoryFilter, viewId],
  );
  const mixedScopeKey = mixedScope
    ? getMixedScopeKey(mixedScope, visibilityFilter)
    : null;
  const mixedPaginationState = mixedScopeKey
    ? mixedScopes[mixedScopeKey]
    : undefined;

  const requestMixedPage = useCallback(
    async (resetCursor: boolean) => {
      if (!mixedScope || !mixedScopeKey) return;
      if (mixedContentStore.getState().fetchingScopes[mixedScopeKey]) return;
      mixedContentStore.getState().setScopeFetching(mixedScopeKey, true);
      try {
        await dataSubscriptionActions.requestMixedContentPage(
          mixedScope,
          visibilityFilter,
          resetCursor
            ? null
            : mixedContentStore.getState().scopes[mixedScopeKey]?.cursor,
        );
      } finally {
        mixedContentStore.getState().setScopeFetching(mixedScopeKey, false);
      }
    },
    [mixedScope, mixedScopeKey, visibilityFilter],
  );

  const requestedMixedScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mixedScopeKey || requestedMixedScopeRef.current === mixedScopeKey) {
      return;
    }
    requestedMixedScopeRef.current = mixedScopeKey;
    void requestMixedPage(true);
  }, [mixedScopeKey, requestMixedPage]);

  const handleLoadMore = useCallback(() => {
    if (mixedScope) return requestMixedPage(false);
    switch (activeFilterType) {
      case "feed":
        return fetchMoreItemsForFeed(feedFilter, visibilityFilter);
      case "category":
        return fetchMoreItemsForCategory(categoryFilter, visibilityFilter);
      default:
        if (viewId) {
          return fetchMoreItems(viewId, visibilityFilter);
        }
        return Promise.resolve();
    }
  }, [
    activeFilterType,
    feedFilter,
    categoryFilter,
    viewId,
    visibilityFilter,
    fetchMoreItemsForFeed,
    fetchMoreItemsForCategory,
    fetchMoreItems,
    mixedScope,
    requestMixedPage,
  ]);

  const handleRefresh = useCallback(() => {
    if (mixedScope) return requestMixedPage(true);
    switch (activeFilterType) {
      case "feed":
        return fetchMoreItemsForFeed(feedFilter, visibilityFilter, {
          force: true,
        });
      case "category":
        return fetchMoreItemsForCategory(categoryFilter, visibilityFilter, {
          force: true,
        });
      default:
        if (viewId) {
          return fetchMoreItems(viewId, visibilityFilter, { force: true });
        }
        return Promise.resolve();
    }
  }, [
    activeFilterType,
    feedFilter,
    categoryFilter,
    viewId,
    visibilityFilter,
    fetchMoreItemsForFeed,
    fetchMoreItemsForCategory,
    fetchMoreItems,
    mixedScope,
    requestMixedPage,
  ]);

  if (mixedScopeKey) {
    return {
      handleLoadMore,
      handleRefresh,
      paginationKey: mixedScopeKey,
      paginationState: mixedPaginationState
        ? {
            cursor: mixedPaginationState.cursor,
            hasMore: mixedPaginationState.hasMore,
            isFetching: fetchingMixedScopes[mixedScopeKey] ?? false,
          }
        : {
            cursor: null,
            hasMore: true,
            isFetching: fetchingMixedScopes[mixedScopeKey] ?? false,
          },
    };
  }

  return { handleLoadMore, handleRefresh, paginationKey, paginationState };
}
