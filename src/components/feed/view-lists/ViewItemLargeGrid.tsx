"use client";

import { useAtomValue } from "jotai";
import { FlipItem } from "./FlipItem";
import { GridItemDisplay } from "./ItemDisplay";
import { ViewListContainer } from "./ViewListContainer";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { useFlipItems } from "~/lib/hooks/useFlipItems";

interface ViewItemLargeGridProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
  sectionItemType?: "feed" | "tag";
}

export function ViewItemLargeGrid({
  items,
  handleMouseSelect,
  sectionItemType,
}: ViewItemLargeGridProps) {
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const { renderedItems, containerRef } = useFlipItems(items);

  return (
    <ViewListContainer className="px-4">
      <div
        ref={containerRef}
        className="relative grid w-full items-stretch gap-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(250px,_1fr))]"
      >
        {renderedItems.map((contentId) => (
          <FlipItem key={contentId} id={contentId}>
            <GridItemDisplay
              contentId={contentId}
              size="large"
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
