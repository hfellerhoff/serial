"use client";

import { useAtom } from "jotai";
import type { VisibilityFilter } from "~/lib/data/atoms";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { visibilityFilterAtom } from "~/lib/data/atoms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

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
      <ToggleGroupItem value="unread">Unread</ToggleGroupItem>
      <ToggleGroupItem value="read">Read</ToggleGroupItem>
      <ToggleGroupItem value="later">Later</ToggleGroupItem>
    </ToggleGroup>
  );
}

export function ItemVisibilitySelect() {
  const [visibilityFilter, setVisibilityFilter] = useAtom(visibilityFilterAtom);

  return (
    <Select
      value={visibilityFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        setVisibilityFilter(value as VisibilityFilter);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Visibility" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unread">Unread</SelectItem>
        <SelectItem value="read">Read</SelectItem>
        <SelectItem value="later">Later</SelectItem>
      </SelectContent>
    </Select>
  );
}
