"use client";

import clsx from "clsx";
import { useAtom } from "jotai";
import { PlusIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "~/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { viewFilterIdAtom } from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import {
  useCheckFilteredFeedItemsForView,
  useUpdateViewFilter,
  useViews,
} from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";

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
    >
      {views.map((view) => (
        <ToggleGroupItem
          className={clsx({
            "opacity-50": !viewHasEntriesMap.get(view.id),
          })}
          key={view.id}
          value={view.id.toString()}
        >
          {view.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
