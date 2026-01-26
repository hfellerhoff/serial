"use client";

import { useAtomValue } from "jotai";
import { useState } from "react";
import { FlameIcon } from "lucide-react";
import { PaginationLoader } from "./view-lists/PaginationLoader";
import {
  categoryFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import { useBulkSetWatchedValueMutation } from "~/lib/data/feed-items/mutations";
import {
  feedItemsStore,
  useCategoryPaginationState,
  useFeedPaginationState,
  useFetchMoreItems,
  useFetchMoreItemsForCategory,
  useFetchMoreItemsForFeed,
  useViewPaginationState,
} from "~/lib/data/store";
import {
  useLastFullyVisibleIndex,
  useResetVisibleItems,
} from "~/lib/data/visible-items-store";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function MarkVisibleAsReadButton() {
  const [isLoading, setIsLoading] = useState(false);

  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);

  const filteredItemIds = useFilteredFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();
  const lastFullyVisibleIndex = useLastFullyVisibleIndex();
  const resetVisibleItems = useResetVisibleItems();

  const viewPaginationState = useViewPaginationState();
  const feedPaginationState = useFeedPaginationState();
  const categoryPaginationState = useCategoryPaginationState();

  const fetchMoreItems = useFetchMoreItems();
  const fetchMoreItemsForFeed = useFetchMoreItemsForFeed();
  const fetchMoreItemsForCategory = useFetchMoreItemsForCategory();

  const bulkMutation = useBulkSetWatchedValueMutation();

  const handleMarkAsRead = async () => {
    // Only handle for unread filter with visible items
    if (visibilityFilter !== "unread" || filteredItemIds.length === 0) return;
    // Don't proceed if no items are fully visible yet
    if (lastFullyVisibleIndex < 0) return;

    setIsLoading(true);
    try {
      // Slice from index 0 to lastFullyVisibleIndex (inclusive)
      // This includes items that are above the viewport (scrolled past) and fully visible items
      const visibleItemIds = filteredItemIds.slice(
        0,
        lastFullyVisibleIndex + 1,
      );

      // Prepare items payload
      const items = visibleItemIds
        .map((id) => ({
          id,
          feedId: feedItemsDict[id]?.feedId ?? 0,
        }))
        .filter((item) => item.feedId > 0);

      await bulkMutation.mutateAsync({ items, isWatched: true });

      // Reset visible items tracking so it starts fresh for new items
      resetVisibleItems();

      // Determine active filter type (priority: feed > category > view)
      const activeFilterType =
        feedFilter >= 0 ? "feed" : categoryFilter >= 0 ? "category" : "view";

      // Check hasMore and fetch more content
      switch (activeFilterType) {
        case "feed": {
          const hasMore =
            feedPaginationState[feedFilter]?.[visibilityFilter]?.hasMore ??
            false;
          if (hasMore) fetchMoreItemsForFeed(feedFilter, visibilityFilter);
          break;
        }
        case "category": {
          const hasMore =
            categoryPaginationState[categoryFilter]?.[visibilityFilter]
              ?.hasMore ?? false;
          if (hasMore)
            fetchMoreItemsForCategory(categoryFilter, visibilityFilter);
          break;
        }
        default: {
          if (viewFilter?.id) {
            const hasMore =
              viewPaginationState[viewFilter.id]?.[visibilityFilter]?.hasMore ??
              false;
            if (hasMore) fetchMoreItems(viewFilter.id, visibilityFilter);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useShortcut("e", handleMarkAsRead);

  // Only show for unread filter
  if (visibilityFilter !== "unread") return null;

  // Don't show if no items visible
  if (filteredItemIds.length === 0) return null;

  if (isLoading) {
    return <PaginationLoader />;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <ButtonWithShortcut
        onClick={handleMarkAsRead}
        disabled={isLoading}
        className="shadow-lg"
        variant="outline"
        size="default"
        shortcut="e"
      >
        <FlameIcon size={16} />
        <span className="pl-1.5">Mark visible as read</span>
      </ButtonWithShortcut>
    </div>
  );
}
