"use client";

import { useCallback } from "react";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

import clsx from "clsx";
import { useAtom, useAtomValue } from "jotai";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  categoryFilterAtom,
  dateFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFeedCategoriesQuery } from "~/lib/data/feedCategories";
import {
  doesFeedItemPassFilters,
  useFeedItemsQuery,
} from "~/lib/data/feedItems";

function useCheckFilteredFeedItemsForCategory() {
  const { data: feedItems } = useFeedItemsQuery();
  const { data: feedCategories } = useFeedCategoriesQuery();

  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  return useCallback(
    (category: number) => {
      if (!feedItems || !feedCategories) return [];
      return feedItems.filter((item) =>
        doesFeedItemPassFilters(
          item,
          dateFilter,
          visibilityFilter,
          category,
          feedCategories,
        ),
      );
    },
    [feedItems, dateFilter, visibilityFilter, feedCategories],
  );
}

export function CategorySelectionChips() {
  const checkFilteredFeedItemsForCategory =
    useCheckFilteredFeedItemsForCategory();

  const [categoryFilter, setCategoryFilter] = useAtom(categoryFilterAtom);

  const trpc = useTRPC();
  const { data: categories } = useQuery(
    trpc.contentCategories.getAll.queryOptions(),
  );

  const categoryOptions = categories?.map((category) => ({
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
