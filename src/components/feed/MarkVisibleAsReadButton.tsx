"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { FlameIcon } from "lucide-react";
import { PaginationLoader } from "./view-lists/PaginationLoader";
import {
  categoryFilterAtom,
  feedFilterAtom,
  selectedItemIdAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import {
  setBulkWatchedValue,
  useBulkSetWatchedValueMutation,
} from "~/lib/data/feed-items/mutations";
import {
  feedItemsStore,
  useFetchMoreItems,
  useFetchMoreItemsForCategory,
  useFetchMoreItemsForFeed,
} from "~/lib/data/store";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { showUndoToast } from "~/lib/undo";
import {
  getFirstRenderedFeedItemId,
  useScrollToFeedItem,
} from "~/lib/hooks/useScrollToFeedItem";

export function MarkVisibleAsReadButton() {
  const [isLoading, setIsLoading] = useState(false);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const scrollToItem = useScrollToFeedItem();

  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const viewFilter = useAtomValue(viewFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);

  const filteredItemIds = useFilteredFeedItemsOrder();
  const feedItemsDict = feedItemsStore.useFeedItemsDict();

  const fetchMoreItems = useFetchMoreItems();
  const fetchMoreItemsForFeed = useFetchMoreItemsForFeed();
  const fetchMoreItemsForCategory = useFetchMoreItemsForCategory();

  const bulkMutation = useBulkSetWatchedValueMutation();

  const selectFirstRenderedItem = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const nextItemId = getFirstRenderedFeedItemId();
        setSelectedItemId(nextItemId);
        scrollToItem(nextItemId);
      });
    });
  }, [scrollToItem, setSelectedItemId]);

  const handleMarkAsRead = async () => {
    if (visibilityFilter !== "unread" || filteredItemIds.length === 0) return;

    setIsLoading(true);
    try {
      const items = filteredItemIds
        .map((id) => ({
          id,
          feedId: feedItemsDict[id]?.feedId ?? 0,
        }))
        .filter((item) => item.feedId > 0);

      if (items.length === 0) return;

      await bulkMutation.mutateAsync({ items, isWatched: true });

      showUndoToast({
        message: `Marked ${items.length} item${items.length === 1 ? "" : "s"} as read`,
        onUndo: async () => {
          await setBulkWatchedValue({ items, isWatched: false });
        },
      });

      // Determine active filter type (priority: feed > category > view)
      const activeFilterType =
        feedFilter >= 0 ? "feed" : categoryFilter >= 0 ? "category" : "view";

      // Force one refill request after the mutation. Marking items as read can
      // make a previously exhausted page eligible for fresh unread content.
      switch (activeFilterType) {
        case "feed": {
          await fetchMoreItemsForFeed(feedFilter, visibilityFilter, {
            force: true,
          });
          break;
        }
        case "category": {
          await fetchMoreItemsForCategory(categoryFilter, visibilityFilter, {
            force: true,
          });
          break;
        }
        default: {
          if (viewFilter?.id) {
            await fetchMoreItems(viewFilter.id, visibilityFilter, {
              force: true,
            });
          }
        }
      }

      selectFirstRenderedItem();
    } finally {
      setIsLoading(false);
    }
  };

  useShortcut(SHORTCUT_KEYS.MARK_VISIBLE_READ, handleMarkAsRead);

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
        shortcut={SHORTCUT_KEYS.MARK_VISIBLE_READ}
      >
        <FlameIcon size={16} />
        <span className="pl-1.5">Mark all as read</span>
      </ButtonWithShortcut>
    </div>
  );
}
