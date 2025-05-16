"use client";

import { useCallback, useState } from "react";

import { useAtom, useAtomValue } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon } from "lucide-react";
import { EditViewDialog } from "~/components/AddViewDialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  dateFilterAtom,
  useFeedItemsMap,
  useFeedItemsOrder,
  viewFilterIdAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useFeeds } from "~/lib/data/feeds";
import { useUpdateViewFilter, useViews } from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";

export function useCheckFilteredFeedItemsForView() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();
  const { views } = useViews();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  return useCallback(
    (viewId: number) => {
      if (!feedItemsOrder || !feedCategories) return [];
      const viewFilter = views.find((view) => view.id === viewId) || null;

      return feedItemsOrder.filter(
        (item) =>
          feedItemsMap[item] &&
          doesFeedItemPassFilters(
            feedItemsMap[item],
            dateFilter,
            visibilityFilter,
            -1,
            feedCategories,
            -1,
            feeds,
            viewFilter,
          ),
      );
    },
    [
      feedItemsOrder,
      feedItemsMap,
      dateFilter,
      visibilityFilter,
      feedCategories,
    ],
  );
}

export function SidebarViews() {
  const [selectedViewForEditing, setSelectedViewForEditing] = useState<
    null | number
  >(null);

  const launchDialog = useDialogStore((store) => store.launchDialog);
  const checkFilteredFeedItemsForView = useCheckFilteredFeedItemsForView();

  const updateViewFilter = useUpdateViewFilter();
  const [viewFilter] = useAtom(viewFilterIdAtom);

  const { views } = useViews();

  const viewOptions = views?.map((view) => ({
    ...view,
    hasEntries: !!checkFilteredFeedItemsForView(view.id).length,
  }));

  return (
    <>
      <EditViewDialog
        selectedViewId={selectedViewForEditing}
        onClose={() => setSelectedViewForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block flex-1">Views</span>
          <div className="flex w-fit items-center justify-end">
            <SidebarMenuButton onClick={() => launchDialog("add-view")}>
              <PlusIcon />
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          {viewOptions?.map((option) => {
            return (
              <SidebarMenuItem key={option.id} className="group flex gap-1">
                <SidebarMenuButton
                  variant={option.id === viewFilter ? "outline" : "default"}
                  onClick={() => updateViewFilter(option.id)}
                >
                  {!option.hasEntries && (
                    <CircleSmall className="text-sidebar-accent" />
                  )}
                  {option.hasEntries && (
                    <div className="grid size-4 place-items-center">
                      <div className="bg-sidebar-accent size-2.5 rounded-full" />
                    </div>
                  )}
                  {option.name}
                </SidebarMenuButton>
                {!option.isDefault && (
                  <div className="group/button flex w-fit items-center justify-end">
                    <SidebarMenuButton
                      onClick={() => setSelectedViewForEditing(option.id)}
                    >
                      <Edit2Icon className="opacity-30 transition-opacity group-hover/button:opacity-100" />
                    </SidebarMenuButton>
                  </div>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
