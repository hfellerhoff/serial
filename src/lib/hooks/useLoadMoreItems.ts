"use client";

import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
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

export function useLoadMoreItems() {
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const currentView = useAtomValue(viewFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  const viewPaginationState = useViewPaginationState();
  const feedPaginationState = useFeedPaginationState();
  const categoryPaginationState = useCategoryPaginationState();

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

  const handleLoadMore = useCallback(() => {
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
  ]);

  return { handleLoadMore, paginationKey, paginationState };
}
