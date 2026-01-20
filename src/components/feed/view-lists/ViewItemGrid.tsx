"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useAtomValue } from "jotai";
import { GridItemDisplay } from "./ItemDisplay";
import { viewFilterAtom, visibilityFilterAtom } from "~/lib/data/atoms";
import { useFetchMoreItems, useViewPaginationState } from "~/lib/data/store";
import { useInfiniteScroll } from "~/lib/hooks/useInfiniteScroll";
import { useLazyFeedFilter } from "~/lib/hooks/useLazyFeedFilter";
import { useLazyCategoryFilter } from "~/lib/hooks/useLazyCategoryFilter";

interface ViewItemGridProps {
  items: string[];
}

export function ViewItemGrid({ items }: ViewItemGridProps) {
  const [parent] = useAutoAnimate();

  // Lazy load items when feed or category filter changes
  useLazyFeedFilter();
  useLazyCategoryFilter();

  const currentView = useAtomValue(viewFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const viewPaginationState = useViewPaginationState();
  const fetchMoreItems = useFetchMoreItems();

  const viewId = currentView?.id;
  const paginationState = viewId
    ? viewPaginationState[viewId]?.[visibilityFilter]
    : undefined;

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: () => {
      if (viewId) {
        fetchMoreItems(viewId, visibilityFilter);
      }
    },
    hasMore: paginationState?.hasMore ?? false,
    isLoading: paginationState?.isFetching ?? false,
  });

  // Calculate position for sentinel (at 70% of items)
  const sentinelPosition = Math.floor(items.length * 0.7);

  return (
    <div className="w-full">
      <div
        ref={parent}
        className="grid w-full grid-cols-2 gap-y-4 px-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] md:gap-2"
      >
        {items.map((contentId, index) => (
          <div key={contentId}>
            <GridItemDisplay contentId={contentId} size="standard" />
            {index === sentinelPosition && <div ref={sentinelRef} />}
          </div>
        ))}
      </div>
    </div>
  );
}
