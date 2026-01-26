"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { GridItemDisplay } from "./ItemDisplay";
import { PaginationEnd } from "./PaginationEnd";
import { PaginationLoader } from "./PaginationLoader";
import { VisibleItemTracker } from "./VisibleItemTracker";
import { useViewListScroll } from "./useViewListScroll";

interface ViewItemLargeGridProps {
  items: string[];
}

export function ViewItemLargeGrid({ items }: ViewItemLargeGridProps) {
  const [parent] = useAutoAnimate();

  const { sentinelRef, sentinelIndex, paginationState } =
    useViewListScroll(items);

  return (
    <div className="w-full">
      <div
        ref={parent}
        className="grid w-full gap-4 px-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(250px,_1fr))]"
      >
        {items.map((contentId, index) => (
          <VisibleItemTracker key={contentId} index={index}>
            <GridItemDisplay contentId={contentId} size="large" />
            {index === sentinelIndex && (
              <div ref={sentinelRef} key={sentinelIndex} />
            )}
          </VisibleItemTracker>
        ))}
      </div>
      {paginationState?.isFetching && <PaginationLoader />}
      {!paginationState?.hasMore && <PaginationEnd />}
    </div>
  );
}
