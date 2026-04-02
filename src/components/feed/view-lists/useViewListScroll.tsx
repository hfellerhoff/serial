import { useInfiniteScroll } from "~/lib/hooks/useInfiniteScroll";
import { useLoadMoreItems } from "~/lib/hooks/useLoadMoreItems";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { ITEMS_PER_PAGE } from "~/server/api/constants";

export function useViewListScroll(itemIds: string[]) {
  useLazyFeedFilter();
  useLazyCategoryFilter();

  const { handleLoadMore, paginationState } = useLoadMoreItems();

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
