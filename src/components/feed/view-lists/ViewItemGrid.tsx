"use client";

import { useAtomValue } from "jotai";
import { FlipItem } from "./FlipItem";
import { GridItemDisplay } from "./ItemDisplay";
import { ViewListContainer } from "./ViewListContainer";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { useFlipItems } from "~/lib/hooks/useFlipItems";

interface ViewItemGridProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
  sectionItemType?: "feed" | "tag";
}

export function ViewItemGrid({
  items,
  handleMouseSelect,
  sectionItemType,
}: ViewItemGridProps) {
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const { renderedItems, containerRef } = useFlipItems(items);

  return (
    <ViewListContainer className="px-4">
      <div
        ref={containerRef}
        className="relative grid w-full grid-cols-2 items-stretch gap-y-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] md:gap-2"
      >
        {renderedItems.map((contentId) => (
          <FlipItem key={contentId} id={contentId}>
            <GridItemDisplay
              contentId={contentId}
              size="standard"
              isSelected={contentId === selectedItemId}
              onSelect={
                handleMouseSelect
                  ? () => handleMouseSelect(contentId)
                  : undefined
              }
              sectionItemType={sectionItemType}
            />
          </FlipItem>
        ))}
      </div>
    </ViewListContainer>
  );
}
