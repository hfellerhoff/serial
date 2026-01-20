"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { visibilityFilterAtom } from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";

/**
 * Hook that triggers lazy loading of items when visibility filter changes.
 * Fetches items for ALL views when switching to "read" or "later" filters.
 *
 * Should be called in a component that renders the feed items list.
 */
export function useLazyVisibilityFilter() {
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  useEffect(() => {
    // "unread" is already fetched for all views on initial load
    if (visibilityFilter === "unread") return;

    // Fetch items for all views with a single API call
    feedItemsStore.getState().fetchItemsForAllViews(visibilityFilter);
  }, [visibilityFilter]);
}
