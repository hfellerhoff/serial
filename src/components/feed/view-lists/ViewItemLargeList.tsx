"use client";

import { useAtomValue } from "jotai";
import { Fragment } from "react";
import { ItemDisplay } from "./ItemDisplay";
import { ViewListContainer } from "./ViewListContainer";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { useDeferredAutoAnimate } from "~/lib/hooks/useDeferredAutoAnimate";

interface ViewItemLargeListProps {
  items: string[];
  handleMouseSelect?: (itemId: string) => void;
  sectionItemType?: "feed" | "tag";
  disableAutoAnimate?: boolean;
}

export function ViewItemLargeList({
  items,
  handleMouseSelect,
  sectionItemType,
  disableAutoAnimate,
}: ViewItemLargeListProps) {
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const [parent] = useDeferredAutoAnimate<HTMLDivElement>({
    disabled: disableAutoAnimate,
  });

  return (
    <ViewListContainer>
      <div ref={parent} className="transition-all md:pt-2">
        {items.map((contentId) => {
          return (
            <Fragment key={contentId}>
              <ItemDisplay
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
