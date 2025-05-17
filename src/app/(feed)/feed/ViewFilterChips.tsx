"use client";

import clsx from "clsx";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { viewFilterIdAtom } from "~/lib/data/atoms";
import {
  useCheckFilteredFeedItemsForView,
  useUpdateViewFilter,
  useViews,
} from "~/lib/data/views";

export function ViewFilterChips() {
  const { views } = useViews();
  const [viewFilter] = useAtom(viewFilterIdAtom);

  const updateViewFilter = useUpdateViewFilter();

  const checkFilteredFeedItemsForView = useCheckFilteredFeedItemsForView();

  const viewHasEntriesMap = useMemo(() => {
    const map = new Map<number, boolean>();
    views.forEach((view) => {
      map.set(view.id, checkFilteredFeedItemsForView(view.id).length > 0);
    });
    return map;
  }, [views, checkFilteredFeedItemsForView]);

  return (
    <ToggleGroup
      type="single"
      value={viewFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        updateViewFilter(parseInt(value));
      }}
      size="sm"
    >
      {views.map((view) => (
        <ToggleGroupItem
          className={clsx({
            "opacity-50": !viewHasEntriesMap.get(view.id),
          })}
          key={view.id}
          value={view.id.toString()}
        >
          {view.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
