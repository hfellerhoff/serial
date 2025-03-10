"use client";

import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { useAtom } from "jotai";
import { dateFilterAtom } from "~/lib/data/atoms";

export function DateFilterChips() {
  const [dateFilter, setDateFilter] = useAtom(dateFilterAtom);

  return (
    <ToggleGroup
      type="single"
      value={dateFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        setDateFilter(parseInt(value));
      }}
      size="sm"
    >
      <ToggleGroupItem value="1">Today</ToggleGroupItem>
      <ToggleGroupItem value="7">This Week</ToggleGroupItem>
      <ToggleGroupItem value="30">This Month</ToggleGroupItem>
    </ToggleGroup>
  );
}
