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
import { Button } from "~/components/ui/button";

export function MarkVisibleAsReadButton() {
  const [isLoading, setIsLoading] = useState(false);

  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);

  const filteredItemIds = useFilteredFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();

  const viewPaginationState = useViewPaginationState();
  const feedPaginationState = useFeedPaginationState();
  const categoryPaginationState = useCategoryPaginationState();

  const fetchMoreItems = useFetchMoreItems();
  const fetchMoreItemsForFeed = useFetchMoreItemsForFeed();
  const fetchMoreItemsForCategory = useFetchMoreItemsForCategory();

  const bulkMutation = useBulkSetWatchedValueMutation();

  // Only show for unread filter
  if (visibilityFilter !== "unread") return null;

  // Don't show if no items visible
  if (filteredItemIds.length === 0) return null;

  const handleMarkAsRead = async () => {
    setIsLoading(true);
    try {
      // Prepare items payload
      const items = filteredItemIds
        .map((id) => ({
          id,
          feedId: feedItemsDict[id]?.feedId ?? 0,
        }))
        .filter((item) => item.feedId > 0);

      await bulkMutation.mutateAsync({ items, isWatched: true });

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

  if (isLoading) {
    return <PaginationLoader />;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <Button
        onClick={handleMarkAsRead}
        disabled={isLoading}
        className="shadow-lg"
        variant="outline"
        size="default"
      >
        <FlameIcon size={16} />
        <span className="pl-1.5">Mark visible as read</span>
      </Button>
    </div>
  );
}
