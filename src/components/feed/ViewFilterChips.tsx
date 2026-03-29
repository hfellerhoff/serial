"use client";

import clsx from "clsx";
import { useAtom } from "jotai";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { useDialogStore } from "./dialogStore";
import { Button } from "~/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { viewFilterIdAtom } from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import {
  useCheckFilteredFeedItemsForView,
  useUpdateViewFilter,
  useViews,
} from "~/lib/data/views";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import {
  MAX_VIEW_SHORTCUTS,
  VIEW_SHORTCUT_KEYS,
} from "~/lib/constants/shortcuts";

export function ViewFilterChips() {
  const { views } = useViews();
  const { contentCategories } = useContentCategories();
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

  const launchDialog = useDialogStore((store) => store.launchDialog);

  if (contentCategories.length === 0) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          launchDialog("add-content-category");
        }}
      >
        <PlusIcon size={16} />
        <span className="pl-1.5">Add a category</span>
      </Button>
    );
  }

  if (views.length === 1) {
    return (
      <Button
        variant="outline"
        onClick={() => {
          launchDialog("add-view");
        }}
      >
        <PlusIcon size={16} />
        <span className="pl-1.5">Add a view</span>
      </Button>
    );
  }

  return (
    <ToggleGroup
      type="single"
      value={viewFilter.toString()}
      onValueChange={(value) => {
        if (!value) return;
        updateViewFilter(parseInt(value));
      }}
      size="sm"
      className="flex max-w-[calc(100vw-3rem)] flex-wrap items-start justify-start md:max-w-lg md:items-center md:justify-center"
      rovingFocus={false}
    >
      {views.map((view, index) => {
        const isActive = view.id === viewFilter;
        return (
          <ToggleGroupItem
            className={clsx({
              "opacity-50": !viewHasEntriesMap.get(view.id),
            })}
            key={view.id}
            value={view.id.toString()}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
          >
            {view.name}
            {index < MAX_VIEW_SHORTCUTS && (
              <KeyboardShortcutDisplay
                shortcut={VIEW_SHORTCUT_KEYS[index]!}
                position="right"
                isActive={isActive}
              />
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
