"use client";

import { useAtom } from "jotai";
import type { VisibilityFilter } from "~/lib/data/atoms";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
  later: SHORTCUT_KEYS.SAVED,
};

const VISIBILITY_FILTER_LABELS: Record<VisibilityFilter, string> = {
  later: "Saved",
  unread: "Unread",
  read: "Archived",
};

const VISIBILITY_FILTER_ORDER: VisibilityFilter[] = ["unread", "later", "read"];

export function ItemVisibilityChips() {
  const [visibilityFilter, setVisibilityFilter] = useAtom(visibilityFilterAtom);

  return (
    <Tabs
      value={visibilityFilter}
      onValueChange={(value) => {
        if (!value) return;
        setVisibilityFilter(value as VisibilityFilter);
      }}
    >
      <TabsList>
        {VISIBILITY_FILTER_ORDER.map((filter) => {
          return (
            <TabsTrigger className="relative" key={filter} value={filter}>
              {VISIBILITY_FILTER_LABELS[filter]}
              <KeyboardShortcutDisplay
                shortcut={VISIBILITY_FILTER_SHORTCUTS[filter]}
              />
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
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
        {VISIBILITY_FILTER_ORDER.map((filter) => (
          <SelectItem key={filter} value={filter}>
            {VISIBILITY_FILTER_LABELS[filter]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
