"use client";

import { useCallback } from "react";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { CircleSmall } from "lucide-react";
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
  useFeedItemsMap,
  useFeedItemsOrder,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters } from "~/lib/data/feed-items";

function useCheckFilteredFeedItemsForView() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsMap = useFeedItemsMap();
  const { feedCategories } = useFeedCategories();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  return useCallback(
    (category: number) => {
      if (!feedItemsOrder || !feedCategories) return [];
      return feedItemsOrder.filter(
        (item) =>
          feedItemsMap[item] &&
          doesFeedItemPassFilters(
            feedItemsMap[item],
            dateFilter,
            visibilityFilter,
            category,
            feedCategories,
            -1,
            [],
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
  const checkFilteredFeedItemsForCategory = useCheckFilteredFeedItemsForView();

  const setFeedFilter = useSetAtom(feedFilterAtom);
  const setDateFilter = useSetAtom(dateFilterAtom);
  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const { contentCategories } = useContentCategories();

  const categoryOptions = contentCategories?.map((category) => ({
    ...category,
    hasEntries: !!checkFilteredFeedItemsForCategory(category.id).length,
  }));

  const hasAnyItems = !!checkFilteredFeedItemsForCategory(-1).length;

  if (!categoryOptions?.length) return null;

  const updateCategoryFilter = (category: number) => {
    setFeedFilter(-1);
    setCategoryFilter(category);
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Views</SidebarGroupLabel>
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
            <SidebarMenuItem key={option.id}>
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
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
