"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { categoryFilterAtom, visibilityFilterAtom } from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";

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

    // Check if already fetched for this category/filter
    const fetchedFilters =
      feedItemsStore.getState().fetchedCategoryFilters[categoryFilter];
    if (fetchedFilters?.has(visibilityFilter)) {
      return;
    }

    // Request items via the publisher pattern
    void dataSubscriptionActions.requestItemsByCategoryId(
      categoryFilter,
      visibilityFilter,
    );
  }, [categoryFilter, visibilityFilter]);
}
