"use client";

import { useCallback, useState } from "react";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall, Edit2Icon, PlusIcon } from "lucide-react";
import { EditContentCategoryDialog } from "~/components/AddContentCategoryDialog";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";
import { useDeselectViewFilter } from "~/lib/data/views";
import { useDialogStore } from "./dialogStore";
import { useFeedItemsDict, useFeedItemsOrder } from "~/lib/data/store";

function useCheckFilteredFeedItemsForCategory() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsDict();
  const { feedCategories } = useFeedCategories();

  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  return useCallback(
    (category: number) => {
      if (!feedItemsOrder || !feedCategories) return [];
      return feedItemsOrder.filter(
        (item) =>
          feedItemsMap[item] &&
          doesFeedItemPassFilters(
            feedItemsMap[item],
            30,
            visibilityFilter,
            category,
            feedCategories,
            -1,
            [],
            null,
          ),
      );
    },
    [feedItemsOrder, feedItemsMap, visibilityFilter, feedCategories],
  );
}

export function SidebarCategories() {
  const [
    selectedContentCategoryForEditing,
    setSelectedContentCategoryForEditing,
  ] = useState<null | number>(null);

  const checkFilteredFeedItemsForCategory =
    useCheckFilteredFeedItemsForCategory();

  const setFeedFilter = useSetAtom(feedFilterAtom);
  const setDateFilter = useSetAtom(dateFilterAtom);
  const deselectViewFilter = useDeselectViewFilter();
  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const launchDialog = useDialogStore((store) => store.launchDialog);

  const { contentCategories } = useContentCategories();

  const categoryOptions = contentCategories?.map((category) => ({
    ...category,
    hasEntries: !!checkFilteredFeedItemsForCategory(category.id).length,
  }));

  const hasAnyItems = !!checkFilteredFeedItemsForCategory(-1).length;

  const updateCategoryFilter = (category: number) => {
    setFeedFilter(-1);
    setCategoryFilter(category);
    setDateFilter(30);
    deselectViewFilter();
  };

  return (
    <>
      <EditContentCategoryDialog
        selectedContentCategoryId={selectedContentCategoryForEditing}
        onClose={() => setSelectedContentCategoryForEditing(null)}
      />
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="pr-0 pb-2">
          <span className="inline-block flex-1">Categories</span>
          <div className="flex w-fit items-center justify-end">
            <SidebarMenuButton
              onClick={() => launchDialog("add-content-category")}
            >
              <PlusIcon />
            </SidebarMenuButton>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              variant={categoryFilter === -1 ? "outline" : "default"}
              onClick={() => {
                updateCategoryFilter(-1);
                setDateFilter(1);
              }}
            >
              {!hasAnyItems && (
                <CircleSmall size={16} className="text-sidebar-accent" />
              )}
              {hasAnyItems && (
                <div className="grid size-4 place-items-center">
                  <div className="bg-sidebar-accent size-2.5 rounded-full" />
                </div>
              )}
              All
            </SidebarMenuButton>
          </SidebarMenuItem>
          {categoryOptions?.map((option) => {
            return (
              <SidebarMenuItem key={option.id} className="group flex gap-1">
                <SidebarMenuButton
                  variant={option.id === categoryFilter ? "outline" : "default"}
                  onClick={() => updateCategoryFilter(option.id)}
                >
                  {!option.hasEntries && (
                    <CircleSmall size={16} className="text-sidebar-accent" />
                  )}
                  {option.hasEntries && (
                    <div className="grid size-4 place-items-center">
                      <div className="bg-sidebar-accent size-2.5 rounded-full" />
                    </div>
                  )}
                  {option.name}
                </SidebarMenuButton>
                <div className="group/button flex w-fit items-center justify-end">
                  <SidebarMenuButton
                    onClick={() =>
                      setSelectedContentCategoryForEditing(option.id)
                    }
                  >
                    <Edit2Icon className="opacity-30 transition-opacity group-hover/button:opacity-100" />
                  </SidebarMenuButton>
                </div>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
