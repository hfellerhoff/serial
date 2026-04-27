"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { visibilityFilterAtom } from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";
import { viewsStore } from "~/lib/data/views/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";

/**
 * Hook that triggers lazy loading of items when visibility filter changes.
 * Fetches items for ALL views when switching to "read" or "later" filters.
 *
 * Uses a single requestInitialData call instead of per-view requests for efficiency.
 * Should be called in a component that renders the feed items list.
 */
export function useLazyVisibilityFilter() {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  useEffect(() => {
    // "unread" is already fetched for all views on initial load
    if (visibilityFilter === "unread") return;

    // Check if ANY view needs fetching for this visibility filter
    const allViews = viewsStore.getState().views;
    const fetchedFilters = feedItemsStore.getState().fetchedVisibilityFilters;

    const needsFetch = allViews.some((view) => {
      const viewFetchedFilters = fetchedFilters[view.id];
      return !viewFetchedFilters?.has(visibilityFilter);
    });

    if (needsFetch) {
      // Single request fetches items for all views with this visibility filter
      void dataSubscriptionActions.requestInitialData({ visibilityFilter });
    }
  }, [visibilityFilter]);
}
