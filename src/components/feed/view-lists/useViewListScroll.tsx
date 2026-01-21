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
import { useInfiniteScroll } from "~/lib/hooks/useInfiniteScroll";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { ITEMS_PER_PAGE } from "~/server/api/constants";

export function useViewListScroll(itemIds: string[]) {
  useLazyFeedFilter();
  useLazyCategoryFilter();

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

  // Determine which filter is active (feed > category > view priority)
  const activeFilterType =
    feedFilter >= 0 ? "feed" : categoryFilter >= 0 ? "category" : "view";

  const viewId = currentView?.id;

  // Get appropriate pagination state based on active filter
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

  // Handle load more based on active filter type
  const handleLoadMore = useCallback(() => {
    switch (activeFilterType) {
      case "feed":
        fetchMoreItemsForFeed(feedFilter, visibilityFilter);
        break;
      case "category":
        fetchMoreItemsForCategory(categoryFilter, visibilityFilter);
        break;
      default:
        if (viewId) {
          fetchMoreItems(viewId, visibilityFilter);
        }
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

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: handleLoadMore,
    hasMore: paginationState?.hasMore ?? false,
    isLoading: paginationState?.isFetching ?? false,
  });

  const sentinelIndex = Math.max(
    Math.floor(itemIds.length - ITEMS_PER_PAGE / 2),
    10,
  );

  return { sentinelRef, sentinelIndex, paginationState };
}
