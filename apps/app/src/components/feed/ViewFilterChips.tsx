"use client";

import clsx from "clsx";
import { useAtom, useAtomValue } from "jotai";
import { PlusIcon } from "lucide-react";
import { useDialogStore } from "./dialogStore";
import { Button } from "~/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { contentStatusFilterAtom, viewFilterIdAtom } from "~/lib/data/atoms";
import { useUpdateViewFilter, useViews } from "~/lib/data/views";
import { KeyboardShortcutDisplay } from "~/components/ButtonWithShortcut";
import {
  MAX_VIEW_SHORTCUTS,
  VIEW_SHORTCUT_KEYS,
} from "~/lib/constants/shortcuts";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getViewContentAvailability,
  mixedContentStore,
} from "~/lib/data/mixed-content/store";
import { useCanMutate } from "~/lib/data/offline-mutations";

const VIEW_FILTER_SKELETON_WIDTHS = ["w-16", "w-22", "w-18", "w-26"];

function ViewFilterChipSkeletons() {
  return (
    <div className="flex max-w-[calc(100vw-3rem)] flex-wrap gap-1 md:max-w-lg">
      {VIEW_FILTER_SKELETON_WIDTHS.map((width) => (
        <Skeleton className={clsx("h-8", width)} key={width} />
      ))}
    </div>
  );
}

export function ViewFilterChips() {
  const canMutate = useCanMutate();
  const { views, hasFetchedViews } = useViews();
  const mixedScopes = mixedContentStore.useScopes();
  const [viewFilter] = useAtom(viewFilterIdAtom);
  const contentStatusFilter = useAtomValue(contentStatusFilterAtom);

  const updateViewFilter = useUpdateViewFilter();

  const launchDialog = useDialogStore((store) => store.launchDialog);

  if (views.length === 1) {
    return (
      <Button
        variant="outline"
        disabled={!canMutate}
        onClick={() => {
          launchDialog("add-view");
        }}
      >
        <PlusIcon size={16} />
        <span className="pl-1.5">Add a view</span>
      </Button>
    );
  }

  if (!hasFetchedViews) {
    return <ViewFilterChipSkeletons />;
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
        return (
          <ToggleGroupItem
            className={clsx("relative", {
              "opacity-50":
                getViewContentAvailability(
                  mixedScopes,
                  view.id,
                  contentStatusFilter,
                ) === false,
            })}
            key={view.id}
            value={view.id.toString()}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
          >
            {view.name}
            {index < MAX_VIEW_SHORTCUTS && (
              <KeyboardShortcutDisplay shortcut={VIEW_SHORTCUT_KEYS[index]!} />
            )}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
