"use client";

import { useAtom } from "jotai";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { viewFilterIdAtom } from "~/lib/data/atoms";
import { useUpdateViewFilter, useViews } from "~/lib/data/views";

export function ViewFilterChips() {
  const { views } = useViews();
  const [viewFilter] = useAtom(viewFilterIdAtom);

  const updateViewFilter = useUpdateViewFilter();

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
        <ToggleGroupItem key={view.id} value={view.id.toString()}>
          {view.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
