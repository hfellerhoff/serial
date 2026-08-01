"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { FlameIcon } from "lucide-react";
import { PaginationLoader } from "./view-lists/PaginationLoader";
import { selectedItemIdAtom, visibilityFilterAtom } from "~/lib/data/atoms";
import { useFilteredContentOrder } from "~/lib/data/feed-items";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { SHORTCUT_KEYS } from "~/lib/constants/shortcuts";
import { showUndoToast } from "~/lib/undo";
import {
  getFirstRenderedFeedItemId,
  useScrollToFeedItem,
} from "~/lib/hooks/useScrollToFeedItem";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { setMixedReadValue } from "~/lib/data/mixed-content/mutations";
import { useLoadMoreItems } from "~/lib/hooks/useLoadMoreItems";

let nextUndoRetentionOwnerId = 0;

export function MarkVisibleAsReadButton() {
  const [isLoading, setIsLoading] = useState(false);
  const setSelectedItemId = useSetAtom(selectedItemIdAtom);
  const scrollToItem = useScrollToFeedItem();

  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const filteredItemIds = useFilteredContentOrder();
  const { handleRefresh } = useLoadMoreItems();

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
      const references = filteredItemIds.map((entityId) => ({
        entityId,
        entityKind: bookmarksStore.getState().getBookmark(entityId)
          ? ("bookmark" as const)
          : ("feed-item" as const),
        sectionPlacement: null,
        normalizedAt: new Date(0),
      }));

      await setMixedReadValue({ references, isRead: true });

      const undoRetentionOwner = `undo:mark-visible:${++nextUndoRetentionOwnerId}`;
      setRetainedEntityPins(undoRetentionOwner, {
        bookmarkIds: references
          .filter((reference) => reference.entityKind === "bookmark")
          .map((reference) => reference.entityId),
        feedItemIds: references
          .filter((reference) => reference.entityKind === "feed-item")
          .map((reference) => reference.entityId),
      });

      // Force one refill request after the mutation. Marking items as read can
      // make a previously exhausted page eligible for fresh unread content.
      try {
        await handleRefresh();
      } finally {
        // The refill response reflects the completed mark-as-read mutation.
        // Exposing Undo afterward prevents a fast shortcut from restoring the
        // item before that older response replaces the scope membership.
        showUndoToast({
          message: `Marked ${references.length} item${references.length === 1 ? "" : "s"} as read`,
          onUndo: async () => {
            await setMixedReadValue({ references, isRead: false });
            await handleRefresh();
          },
          onDismiss: () => clearRetainedEntityPins(undoRetentionOwner),
        });
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
