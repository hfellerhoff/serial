"use client";

import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useFeedItemActions } from "./useFeedItemActions";
import { useBookmarkValue } from "~/lib/data/bookmarks";
import { useUpdateBookmarkStateMutation } from "~/lib/data/bookmarks/mutations";
import { captureRootScrollRestoration } from "~/lib/root-scroll-restoration";
import { contentDestination } from "~/lib/data/content-items/resolver";
import { useBookmarkCaptureValue } from "~/lib/data/bookmarks/capture-store";
import { connectionStateAtom } from "~/lib/data/atoms";
import { canOpenContent } from "~/lib/data/offline-content";
import { canMutateNow } from "~/lib/data/offline-mutations";

export function useContentItemActions(itemId: string) {
  const router = useRouter();
  const bookmark = useBookmarkValue(itemId);
  const capture = useBookmarkCaptureValue(itemId);
  const connectionState = useAtomValue(connectionStateAtom);
  const feedItemActions = useFeedItemActions(itemId);
  const { mutate: updateBookmarkState } =
    useUpdateBookmarkStateMutation(itemId);

  const markAsRead = useCallback(() => {
    if (!bookmark) return feedItemActions.markAsRead();
    if (bookmark.isRead) return;
    if (!canMutateNow()) return;
    updateBookmarkState({ bookmarkId: bookmark.id, isRead: true });
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const toggleRead = useCallback(() => {
    if (!bookmark) return feedItemActions.toggleRead();
    if (!canMutateNow()) return false;
    updateBookmarkState({
      bookmarkId: bookmark.id,
      isRead: !bookmark.isRead,
    });
    return true;
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const toggleWatchLater = useCallback(() => {
    if (!bookmark) return feedItemActions.toggleWatchLater();
    if (!canMutateNow()) return false;
    updateBookmarkState({
      bookmarkId: bookmark.id,
      isSaved: !bookmark.isSaved,
    });
    return true;
  }, [bookmark, feedItemActions, updateBookmarkState]);

  const openItem = useCallback(() => {
    if (!bookmark) return feedItemActions.openItem();
    if (
      !canOpenContent({
        connectionState,
        contentType: bookmark.contentType,
        hasBody: capture !== undefined,
      })
    ) {
      return;
    }
    const destination = contentDestination({
      entityKind: "bookmark",
      entity: bookmark,
    });
    if (connectionState === "disconnected" || !destination.external) {
      captureRootScrollRestoration(itemId);
      void router.navigate({
        to:
          connectionState === "disconnected"
            ? `/read/${bookmark.id}`
            : destination.href,
      });
      return;
    }
    window.open(destination.href, "_blank", "noopener,noreferrer");
  }, [bookmark, capture, connectionState, feedItemActions, itemId, router]);

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
