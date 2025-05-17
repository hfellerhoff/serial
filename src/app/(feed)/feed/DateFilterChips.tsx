"use client";

import { useAtom } from "jotai";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
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

export function DateFilterSelect() {
  const [dateFilter, setDateFilter] = useAtom(dateFilterAtom);

  return (
    <Select
      value={dateFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        setDateFilter(parseInt(value));
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Date" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="1">Today</SelectItem>
        <SelectItem value="7">This Week</SelectItem>
        <SelectItem value="30">This Month</SelectItem>
      </SelectContent>
    </Select>
  );
}
