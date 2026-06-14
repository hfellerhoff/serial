"use client";

import { useCallback } from "react";
import { useRouter } from "@tanstack/react-router";
import { orpcRouterClient } from "../orpc";
import { feedItemsStore, useFeedItemValue } from "../data/store";
import { useFeeds as useFeedsArray } from "../data/feeds/store";
import { saveHomeScrollPosition } from "~/lib/scroll";

export function useFeedItemActions(itemId: string) {
  const router = useRouter();
  const feeds = useFeedsArray();
  const item = useFeedItemValue(itemId);

  const markAsRead = useCallback(() => {
    if (!item) return;
    if (item.isWatched) return;

    void orpcRouterClient.feedItem.setWatchedValue({
      id: itemId,
      feedId: item.feedId,
      isWatched: true,
    });
    feedItemsStore.getState().setFeedItem(itemId, {
      ...item,
      isWatched: true,
      isWatchedUpdatedAt: new Date(),
    });
  }, [item, itemId]);

  const toggleRead = useCallback(() => {
    if (!item) return false;

    const newIsWatched = !item.isWatched;
    void orpcRouterClient.feedItem.setWatchedValue({
      id: itemId,
      feedId: item.feedId,
      isWatched: newIsWatched,
    });
    feedItemsStore.getState().setFeedItem(itemId, {
      ...item,
      isWatched: newIsWatched,
      isWatchedUpdatedAt: newIsWatched ? new Date() : null,
    });

    return true;
  }, [item, itemId]);

  const toggleWatchLater = useCallback(() => {
    if (!item) return;

    void orpcRouterClient.feedItem.setWatchLaterValue({
      id: itemId,
      feedId: item.feedId,
      isWatchLater: !item.isWatchLater,
    });
    feedItemsStore.getState().setFeedItem(itemId, {
      ...item,
      isWatchLater: !item.isWatchLater,
      isWatchLaterUpdatedAt: new Date(),
    });
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
