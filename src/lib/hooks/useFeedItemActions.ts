"use client";

import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { orpcRouterClient } from "../orpc";
import { useFeedItemValue } from "../data/store";
import {
  applyOptimisticWatchedValue,
  applyOptimisticWatchLaterValue,
  resolveOptimisticWatchedValue,
  resolveOptimisticWatchLaterValue,
  rollbackOptimisticWatchedValue,
  rollbackOptimisticWatchLaterValue,
} from "../data/feed-items/mutations";
import { useFeeds as useFeedsArray } from "../data/feeds/store";
import { saveHomeScrollPosition } from "~/lib/scroll";

export function useFeedItemActions(itemId: string) {
  const router = useRouter();
  const feeds = useFeedsArray();
  const item = useFeedItemValue(itemId);

  const markAsRead = useCallback(() => {
    if (!item) return;
    if (item.isWatched) return;

    const context = applyOptimisticWatchedValue(itemId, true);
    void orpcRouterClient.feedItem
      .setWatchedValue({
        id: itemId,
        feedId: item.feedId,
        isWatched: true,
      })
      .then((serverValue) =>
        resolveOptimisticWatchedValue(context, serverValue),
      )
      .catch(() => rollbackOptimisticWatchedValue(context));
  }, [item, itemId]);

  const toggleRead = useCallback(() => {
    if (!item) return false;

    const newIsWatched = !item.isWatched;
    const context = applyOptimisticWatchedValue(itemId, newIsWatched);
    void orpcRouterClient.feedItem
      .setWatchedValue({
        id: itemId,
        feedId: item.feedId,
        isWatched: newIsWatched,
      })
      .then((serverValue) =>
        resolveOptimisticWatchedValue(context, serverValue),
      )
      .catch(() => rollbackOptimisticWatchedValue(context));

    return true;
  }, [item, itemId]);

  const toggleWatchLater = useCallback(() => {
    if (!item) return;

    const context = applyOptimisticWatchLaterValue(itemId, !item.isWatchLater);
    void orpcRouterClient.feedItem
      .setWatchLaterValue({
        id: itemId,
        feedId: item.feedId,
        isWatchLater: !item.isWatchLater,
      })
      .then((serverValue) =>
        resolveOptimisticWatchLaterValue(context, serverValue),
      )
      .catch(() => rollbackOptimisticWatchLaterValue(context));
  }, [item, itemId]);

  const openItem = useCallback(() => {
    if (!item) return;

    const feed = feeds.find((f) => f.id === item.feedId);
    const itemDestination = item.platform === "website" ? "read" : "watch";
    const shouldOpenInSerial =
      feed?.openLocation === "serial" || !feed?.openLocation;

    if (shouldOpenInSerial) {
      saveHomeScrollPosition();
      router.navigate({ to: `/${itemDestination}/${item.id}` });
    } else {
      window.open(item.url, "_blank", "noopener noreferrer");
    }
  }, [item, feeds, router]);

  const openOriginal = useCallback(() => {
    if (!item?.url) return;
    window.open(item.url, "_blank", "noopener noreferrer");
  }, [item]);

  return {
    toggleRead,
    toggleWatchLater,
    markAsRead,
    openItem,
    openOriginal,
  };
}
