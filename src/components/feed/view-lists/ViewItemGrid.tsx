"use client";

import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useAtomValue } from "jotai";
import { GridItemDisplay } from "./ItemDisplay";
import { PaginationEnd } from "./PaginationEnd";
import { PaginationLoader } from "./PaginationLoader";
import { VisibleItemTracker } from "./VisibleItemTracker";
import { useViewListScroll } from "./useViewListScroll";
import { selectedItemIdAtom } from "~/lib/data/atoms";

interface ViewItemGridProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
}

export function ViewItemGrid({ items, handleMouseSelect }: ViewItemGridProps) {
  const [parent] = useAutoAnimate();
  const selectedItemId = useAtomValue(selectedItemIdAtom);

  const { sentinelRef, sentinelIndex, paginationState } =
    useViewListScroll(items);

  return (
    <div className="w-full">
      <div
        ref={parent}
        className="grid w-full grid-cols-2 items-stretch gap-y-4 px-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] md:gap-2"
      >
        {items.map((contentId, index) => (
          <VisibleItemTracker key={contentId} index={index}>
            <GridItemDisplay
              contentId={contentId}
              size="standard"
              isSelected={contentId === selectedItemId}
              onSelect={
                handleMouseSelect
                  ? () => handleMouseSelect(contentId)
                  : undefined
              }
            />
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
