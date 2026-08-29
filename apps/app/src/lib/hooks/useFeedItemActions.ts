"use client";

import { useCallback } from "react";
import { useAtomValue } from "jotai";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { orpcRouterClient } from "../orpc";
import {
  retainFeedItemBody,
  useFeedItemValue,
  useHasRetainedFeedItemBody,
} from "../data/store";
import {
  applyOptimisticWatchedValue,
  applyOptimisticWatchLaterValue,
  resolveOptimisticWatchedValue,
  resolveOptimisticWatchLaterValue,
  rollbackOptimisticWatchedValue,
  rollbackOptimisticWatchLaterValue,
} from "../data/feed-items/mutations";
import { useFeeds as useFeedsArray } from "../data/feeds/store";
import { captureRootScrollRestoration } from "~/lib/root-scroll-restoration";
import { connectionStateAtom } from "~/lib/data/atoms";
import {
  canOpenContent,
  hasRetainedFeedBody,
} from "~/lib/data/offline-content";
import { canMutateNow } from "~/lib/data/offline-mutations";

export function useFeedItemActions(itemId: string) {
  const router = useRouter();
  const feeds = useFeedsArray();
  const item = useFeedItemValue(itemId);
  const hasRetainedBody = useHasRetainedFeedItemBody(itemId);
  const connectionState = useAtomValue(connectionStateAtom);

  const markAsRead = useCallback(() => {
    if (!item) return;
    if (item.isWatched) return;
    if (!canMutateNow()) return;

    const context = applyOptimisticWatchedValue(itemId, true);
    void orpcRouterClient.feedItem
      .setWatchedValue({
        id: itemId,
        feedId: item.feedId,
        isWatched: true,
      })
      .then((serverValue) => {
        resolveOptimisticWatchedValue(context, serverValue);
      })
      .catch(() => rollbackOptimisticWatchedValue(context));
  }, [item, itemId]);

  const toggleRead = useCallback(() => {
    if (!item) return false;
    if (!canMutateNow()) return false;

    const newIsWatched = !item.isWatched;
    const context = applyOptimisticWatchedValue(itemId, newIsWatched);
    void orpcRouterClient.feedItem
      .setWatchedValue({
        id: itemId,
        feedId: item.feedId,
        isWatched: newIsWatched,
      })
      .then((serverValue) => {
        resolveOptimisticWatchedValue(context, serverValue);
      })
      .catch(() => rollbackOptimisticWatchedValue(context));

    return true;
  }, [item, itemId]);

  const toggleWatchLater = useCallback(() => {
    if (!item) return false;
    if (!canMutateNow()) return false;

    const context = applyOptimisticWatchLaterValue(itemId, !item.isWatchLater);
    void orpcRouterClient.feedItem
      .setWatchLaterValue({
        id: itemId,
        feedId: item.feedId,
        isWatchLater: !item.isWatchLater,
      })
      .then((serverValue) => {
        resolveOptimisticWatchLaterValue(context, serverValue);
        if (serverValue.isWatchLater) {
          void retainFeedItemBody(itemId);
        }
      })
      .catch(() => rollbackOptimisticWatchLaterValue(context));
    return true;
  }, [item, itemId]);

  const openItem = useCallback(() => {
    if (!item) return;
    if (
      !canOpenContent({
        connectionState,
        contentType: item.contentType,
        hasBody: hasRetainedFeedBody(item, hasRetainedBody),
      })
    ) {
      return;
    }

    const feed = feeds.find((f) => f.id === item.feedId);
    const itemDestination = item.platform === "website" ? "read" : "watch";
    const shouldOpenInSerial =
      feed?.openLocation === "serial" || !feed?.openLocation;

    // While disconnected, canOpen has restricted opening to retained text
    // bodies, which only the reader can render.
    if (connectionState === "disconnected") {
      captureRootScrollRestoration(itemId);
      void router.navigate({ to: `/read/${item.id}` });
    } else if (shouldOpenInSerial) {
      captureRootScrollRestoration(itemId);
      void router.navigate({ to: `/${itemDestination}/${item.id}` });
    } else {
      window.open(item.url, "_blank", "noopener noreferrer");
    }
  }, [item, feeds, itemId, router, connectionState, hasRetainedBody]);

  const openOriginal = useCallback(() => {
    if (!item?.url) return;
    window.open(item.url, "_blank", "noopener noreferrer");
  }, [item]);

  const copyUrl = useCallback(async () => {
    if (!item?.url) return false;

    try {
      await navigator.clipboard.writeText(item.url);
      toast.success("Link copied");
      return true;
    } catch {
      toast.error("Could not copy URL");
      return false;
    }
  }, [item]);

  return {
    toggleRead,
    toggleWatchLater,
    markAsRead,
    openItem,
    openOriginal,
    copyUrl,
  };
}
