"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { categoryFilterAtom, visibilityFilterAtom } from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";

/**
 * Hook that triggers lazy loading of items when a category is selected.
 * Fetches items for feeds in the selected category with the current visibility filter.
 *
 * Should be called in a component that renders the feed items list.
 */
export function useLazyCategoryFilter() {
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  useEffect(() => {
    // categoryFilter < 0 means no category is selected
    if (categoryFilter < 0) return;

    feedItemsStore
      .getState()
      .fetchItemsForCategory(categoryFilter, visibilityFilter);
  }, [categoryFilter, visibilityFilter]);
}
