"use client";

import { useCallback } from "react";

import clsx from "clsx";
import { useAtom, useAtomValue } from "jotai";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  categoryFilterAtom,
  dateFilterAtom,
  useFeedItemsMap,
  useFeedItemsOrder,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useContentCategories } from "~/lib/data/content-categories";
import { useFeedCategories } from "~/lib/data/feed-categories";
import { doesFeedItemPassFilters, useFeedItems } from "~/lib/data/feed-items";

function useCheckFilteredFeedItemsForCategory() {
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

export function CategorySelectionChips() {
  const checkFilteredFeedItemsForCategory =
    useCheckFilteredFeedItemsForCategory();

  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const { contentCategories } = useContentCategories();

  const categoryOptions = contentCategories?.map((category) => ({
    ...category,
    hasEntries: !!checkFilteredFeedItemsForCategory(category.id).length,
  }));

  const hasAnyItems = !!checkFilteredFeedItemsForCategory(-1).length;

  if (!categoryOptions?.length) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 flex items-center justify-center">
      <div className="bg-background border-border w-full rounded border border-solid px-4 py-2 md:w-max md:max-w-3xl">
        <ScrollArea className="py-2" id="categories">
          <ToggleGroup
            type="single"
            value={categoryFilter.toString()}
            onValueChange={(value) => {
              setCategoryFilter(parseInt(value));
            }}
            size="sm"
          >
            <ToggleGroupItem
              value="-1"
              className={clsx("w-max", {
                "opacity-50": !hasAnyItems && categoryFilter !== -1,
              })}
            >
              All
            </ToggleGroupItem>
            {categoryOptions?.map((option) => (
              <ToggleGroupItem
                key={option.id}
                value={option.id.toString()}
                className={clsx("w-max", {
                  "opacity-50":
                    !option.hasEntries && categoryFilter !== option.id,
                })}
              >
                {option.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
