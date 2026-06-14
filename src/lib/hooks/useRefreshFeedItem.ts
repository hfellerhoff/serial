"use client";

import { useEffect } from "react";
import { mergeFeedItem } from "~/lib/data/feed-items/mergeFeedItem";
import { feedItemsStore } from "~/lib/data/store";
import { orpcRouterClient } from "~/lib/orpc";

export function useRefreshFeedItem(id: string | undefined) {
  useEffect(() => {
    if (!id) return;

    let canceled = false;

    void orpcRouterClient.feedItem
      .getById({ id })
      .then((item) => {
        if (canceled || !item) return;

        const currentItem = feedItemsStore.getState().feedItemsDict[id];
        const currentUpdatedAt = currentItem?.updatedAt?.getTime() ?? 0;
        const incomingUpdatedAt = item.updatedAt?.getTime() ?? 0;

        if (currentUpdatedAt > incomingUpdatedAt) return;

        feedItemsStore
          .getState()
          .setFeedItem(id, mergeFeedItem(currentItem, item));
      })
      .catch((error) => {
        console.error("Error refreshing feed item:", error);
      });

    return () => {
      canceled = true;
    };
  }, [id]);
}
