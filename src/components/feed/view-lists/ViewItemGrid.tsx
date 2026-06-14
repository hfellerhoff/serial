"use client";

import { useAtomValue } from "jotai";
import { Fragment } from "react";
import { GridItemDisplay } from "./ItemDisplay";
import { ViewListContainer } from "./ViewListContainer";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { useDeferredAutoAnimate } from "~/lib/hooks/useDeferredAutoAnimate";

interface ViewItemGridProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
  sectionItemType?: "feed" | "tag";
  disableAutoAnimate?: boolean;
}

export function ViewItemGrid({
  items,
  handleMouseSelect,
  sectionItemType,
  disableAutoAnimate,
}: ViewItemGridProps) {
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const [parent] = useDeferredAutoAnimate<HTMLDivElement>({
    disabled: disableAutoAnimate,
  });

  return (
    <ViewListContainer className="px-4">
      <div
        ref={parent}
        className="grid w-full grid-cols-2 items-stretch gap-y-4 pt-4 md:grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] md:gap-2"
      >
        {items.map((contentId) => {
          return (
            <Fragment key={contentId}>
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
            </Fragment>
          );
        })}
      </div>
    </ViewListContainer>
  );
}
