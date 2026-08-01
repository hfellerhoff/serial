"use client";

import { useEffect, useState } from "react";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { orpcRouterClient } from "~/lib/orpc";

export function useRefreshBookmark(id: string | undefined) {
  const [refreshState, setRefreshState] = useState<{
    id: string;
    bookmark: ApplicationBookmark | null;
  }>();

  useEffect(() => {
    if (!id) return;

    let canceled = false;
    void orpcRouterClient.bookmark
      .getById({ bookmarkId: id })
      .then((bookmark) => {
        if (canceled) return;
        if (bookmark) bookmarksStore.getState().upsert(bookmark);
        setRefreshState({ id, bookmark });
      })
      .catch((error) => {
        console.error("Error refreshing bookmark:", error);
        if (!canceled) setRefreshState({ id, bookmark: null });
      });

    return () => {
      canceled = true;
    };
  }, [id]);

  return refreshState && refreshState.id === id
    ? refreshState.bookmark
    : undefined;
}
