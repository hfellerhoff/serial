"use client";

import { ViewSectionAddDropdown } from "./ViewSectionAddDropdown";
import { ViewSectionList } from "./ViewSectionList";
import type { ViewSection } from "./ViewSectionList";
import type { ViewLayout } from "~/server/db/constants";

interface DisplayTabProps {
  items: ViewSection[];
  selectedFeedIds: number[];
  selectedCategories: number[];
  baseLayout: ViewLayout;
  onReorder: (items: ViewSection[]) => void;
  onRemove: (id: string) => void;
  onAdd: (item: ViewSection) => void;
  onLayoutChange: (id: string, layout: ViewLayout | null) => void;
  onBaseLayoutChange: (layout: ViewLayout) => void;
}

export function DisplayTab({
  items,
  selectedFeedIds,
  selectedCategories,
  baseLayout,
  onReorder,
  onRemove,
  onAdd,
  onLayoutChange,
  onBaseLayoutChange,
}: DisplayTabProps) {
  return (
    <div className="grid gap-4">
      <ViewSectionAddDropdown
        existingItems={items}
        selectedFeedIds={selectedFeedIds}
        selectedCategories={selectedCategories}
        onAdd={onAdd}
      />
      <ViewSectionList
        items={items}
        baseLayout={baseLayout}
        onReorder={onReorder}
        onRemove={onRemove}
        onLayoutChange={onLayoutChange}
        onBaseLayoutChange={onBaseLayoutChange}
      />
    </div>
  );
}
