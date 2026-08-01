"use client";

import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useFeedItemActions } from "./useFeedItemActions";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useUpdateBookmarkStateMutation } from "~/lib/data/bookmarks/mutations";
import { saveHomeScrollPosition } from "~/lib/scroll";

export function useContentItemActions(itemId: string) {
  const router = useRouter();
  const bookmark = useBookmarkValue(itemId);
  const feedItemActions = useFeedItemActions(itemId);
  const { mutate: updateBookmarkState } =
    useUpdateBookmarkStateMutation(itemId);

  const markAsRead = useCallback(() => {
    if (!bookmark) return feedItemActions.markAsRead();
    if (bookmark.isRead) return;
    updateBookmarkState({ bookmarkId: bookmark.id, isRead: true });
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const toggleRead = useCallback(() => {
    if (!bookmark) return feedItemActions.toggleRead();
    updateBookmarkState({
      bookmarkId: bookmark.id,
      isRead: !bookmark.isRead,
    });
    return true;
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const toggleWatchLater = useCallback(() => {
    if (!bookmark) return feedItemActions.toggleWatchLater();
    updateBookmarkState({
      bookmarkId: bookmark.id,
      isSaved: !bookmark.isSaved,
    });
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const openItem = useCallback(() => {
    if (!bookmark) return feedItemActions.openItem();
    if (bookmark.captureHash) {
      saveHomeScrollPosition();
      void router.navigate({ to: `/bookmark/${bookmark.id}` });
      return;
    }
    window.open(
      bookmark.effectiveUrl || bookmark.sourceUrl,
      "_blank",
      "noopener,noreferrer",
    );
  }, [bookmark, feedItemActions, router]);

  const openOriginal = useCallback(() => {
    if (!bookmark) return feedItemActions.openOriginal();
    window.open(bookmark.sourceUrl, "_blank", "noopener,noreferrer");
  }, [bookmark, feedItemActions]);

  const copyUrl = useCallback(async () => {
    if (!bookmark) return feedItemActions.copyUrl();
    try {
      await navigator.clipboard.writeText(bookmark.sourceUrl);
      toast.success("Link copied");
      return true;
    } catch {
      toast.error("Could not copy URL");
      return false;
    }
  }, [bookmark, feedItemActions]);

  return {
    markAsRead,
    toggleRead,
    toggleWatchLater,
    openItem,
    openOriginal,
    copyUrl,
  };
}
