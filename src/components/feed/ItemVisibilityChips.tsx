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
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";

const VISIBILITY_FILTER_SHORTCUTS: Record<VisibilityFilter, string> = {
  unread: SHORTCUT_KEYS.UNREAD,
  read: SHORTCUT_KEYS.READ,
  later: SHORTCUT_KEYS.LATER,
};

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
      rovingFocus={false}
    >
      {(["unread", "read", "later"] as const).map((filter) => {
        const isActive = visibilityFilter === filter;
        return (
          <ToggleGroupItem
            key={filter}
            value={filter}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
            <KeyboardShortcutDisplay
              shortcut={VISIBILITY_FILTER_SHORTCUTS[filter]}
              position="right"
              isActive={isActive}
            />
          </ToggleGroupItem>
        );
      })}
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
