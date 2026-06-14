"use client";

import { useAtomValue } from "jotai";
import { Fragment } from "react";
import { GridItemDisplay } from "./ItemDisplay";
import { ViewListContainer } from "./ViewListContainer";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { useDeferredAutoAnimate } from "~/lib/hooks/useDeferredAutoAnimate";

interface ViewItemLargeGridProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
  sectionItemType?: "feed" | "tag";
  disableAutoAnimate?: boolean;
}

export function ViewItemLargeGrid({
  items,
  handleMouseSelect,
  sectionItemType,
  disableAutoAnimate,
}: ViewItemLargeGridProps) {
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const [parent] = useDeferredAutoAnimate<HTMLDivElement>({
    disabled: disableAutoAnimate,
  });

  return (
    <ViewListContainer className="px-4">
      <div
        ref={parent}
        className="grid w-full items-stretch gap-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(250px,_1fr))]"
      >
        {items.map((contentId) => {
          return (
            <Fragment key={contentId}>
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
            </Fragment>
          );
        })}
      </div>
    </ViewListContainer>
  );
}
