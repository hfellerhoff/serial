"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { feedFilterAtom, visibilityFilterAtom } from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";

/**
 * Hook that triggers lazy loading of items when a feed is selected.
 * Fetches items for the selected feed with the current visibility filter.
 *
 * Should be called in a component that renders the feed items list.
 */
export function useLazyFeedFilter() {
  const feedFilter = useAtomValue(feedFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);

  useEffect(() => {
    // feedFilter < 0 means no feed is selected
    if (feedFilter < 0) return;

    feedItemsStore.getState().fetchItemsForFeed(feedFilter, visibilityFilter);
  }, [feedFilter, visibilityFilter]);
}
