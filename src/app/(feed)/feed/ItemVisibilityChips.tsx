"use client";

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useAtom } from "jotai";
import { type VisibilityFilter, visibilityFilterAtom } from "~/lib/data/atoms";

export function ItemVisibilityChips() {
  const [visibilityFilter, setVisibilityFilter] = useAtom(visibilityFilterAtom);

  return (
    <ToggleGroup
      type="single"
      value={visibilityFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        setVisibilityFilter(value as VisibilityFilter);
      }}
      size="sm"
    >
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      <ToggleGroupItem value="unread">Unread</ToggleGroupItem>
      <ToggleGroupItem value="later">Later</ToggleGroupItem>
    </ToggleGroup>
  );
}
