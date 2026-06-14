"use client";

import { useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import type { ViewSection } from "./ViewSectionList";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { useFeeds } from "~/lib/data/feeds";
import { VIEW_LAYOUT_ITEM_TYPE } from "~/server/db/constants";

interface ViewSectionAddDropdownProps {
  existingItems: ViewSection[];
  selectedFeedIds: number[];
  selectedCategories: number[];
  onAdd: (item: ViewSection) => void;
}

export function ViewSectionAddDropdown({
  existingItems,
  selectedFeedIds,
  selectedCategories,
  onAdd,
}: ViewSectionAddDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { feeds } = useFeeds();
  const { contentCategories } = useContentCategories();
  const { feedCategories } = useFeedCategories();

  const existingIds = useMemo(
    () => new Set(existingItems.map((i) => `${i.itemType}:${i.itemId}`)),
    [existingItems],
  );

  // All feeds in the view: explicitly selected + feeds that have selected categories
  const feedIdsInView = useMemo(() => {
    const ids = new Set(selectedFeedIds);
    for (const fc of feedCategories) {
      if (selectedCategories.includes(fc.categoryId)) {
        ids.add(fc.feedId);
      }
    }
    return ids;
  }, [selectedFeedIds, selectedCategories, feedCategories]);

  const feedOptions = useMemo(
    () =>
      feeds
        .filter(
          (f) =>
            feedIdsInView.has(f.id) &&
            !existingIds.has(`${VIEW_LAYOUT_ITEM_TYPE.FEED}:${f.id}`),
        )
        .map((f) => ({
          id: f.id,
          label: f.name,
          itemType: VIEW_LAYOUT_ITEM_TYPE.FEED,
        })),
    [feeds, feedIdsInView, existingIds],
  );

  // All tags in the view: explicitly selected + tags that feeds in the view have
  const tagIdsInView = useMemo(() => {
    const ids = new Set(selectedCategories);
    for (const fc of feedCategories) {
      if (feedIdsInView.has(fc.feedId)) {
        ids.add(fc.categoryId);
      }
    }
    return ids;
  }, [selectedCategories, feedIdsInView, feedCategories]);

  const tagOptions = useMemo(
    () =>
      contentCategories
        .filter(
          (c) =>
            tagIdsInView.has(c.id) &&
            !existingIds.has(`${VIEW_LAYOUT_ITEM_TYPE.TAG}:${c.id}`),
        )
        .map((c) => ({
          id: c.id,
          label: `#${c.name}`,
          rawLabel: c.name,
          itemType: VIEW_LAYOUT_ITEM_TYPE.TAG,
        })),
    [contentCategories, tagIdsInView, existingIds],
  );

  const allOptions = useMemo(
    () =>
      [...feedOptions, ...tagOptions].sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    [feedOptions, tagOptions],
  );

  const trimmedSearch = search.trim().toLowerCase();
  const filteredOptions = trimmedSearch
    ? allOptions.filter((o) => o.label.toLowerCase().includes(trimmedSearch))
    : allOptions;

  return (
    <div className="flex items-center gap-2">
      <Label>View sections</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6" type="button">
            <PlusIcon size={14} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0" align="start">
          <Command
            shouldFilter={false}
            className="[&_[cmdk-item]]:pointer-events-auto [&_[cmdk-item]]:opacity-100"
          >
            <CommandInput
              placeholder="Search feeds or tags..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {filteredOptions.length === 0 && (
                <CommandEmpty>No feeds or tags found.</CommandEmpty>
              )}
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={`${option.itemType}:${option.id}`}
                    value={`${option.itemType}:${option.id}:${option.label}`}
                    onSelect={() => {
                      onAdd({
                        id: `${option.itemType}:${option.id}`,
                        itemType: option.itemType,
                        itemId: option.id,
                        layout: null,
                      });
                      setSearch("");
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
