"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import type { ClientManifestEntry } from "~/server/api/routers/initialRouter";
import {
  categoryFilterAtom,
  feedFilterAtom,
  viewFilterAtom,
  visibilityFilterAtom,
} from "~/lib/data/atoms";
import { feedItemsStore } from "~/lib/data/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";
import { useFilteredFeedItemsOrder } from "~/lib/data/feed-items";
import { ITEMS_PER_PAGE } from "~/server/api/constants";

const validatingCombos = new Set<string>();

/**
 * Background-validates the cached items for the current view + visibility
 * filter by sending a manifest of cached item IDs + contentHash to the
 * server. The server diffs the manifest against its ground truth and streams
 * back a `view-diff` chunk (handled by the store's `processChunk`).
 *
 * Cached content is shown immediately; updates/deletions/new items stream
 * in transparently without any loading UI.
 */
export function useValidateViewItems() {
  const viewFilter = useAtomValue(viewFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const filteredItemIds = useFilteredFeedItemsOrder();
  const manifestItemIdsKey = filteredItemIds
    .slice(0, ITEMS_PER_PAGE)
    .join("\0");

  useEffect(() => {
    // Feed / category selections use separate endpoints — skip here
    if (feedFilter >= 0 || categoryFilter >= 0) return;

    const viewId = viewFilter?.id;
    if (viewId === undefined || viewId === null) return;

    const key = `${viewId}-${visibilityFilter}`;
    if (validatingCombos.has(key)) return;
    validatingCombos.add(key);

    // The server validates against the first paginated page for this
    // visibility. Keep the manifest scoped to that same client-side page;
    // otherwise cached read/later items outside the first page look deleted.
    const state = feedItemsStore.getState();
    const manifestItemIds =
      manifestItemIdsKey.length > 0 ? manifestItemIdsKey.split("\0") : [];
    const manifest: ClientManifestEntry[] = [];
    for (const id of manifestItemIds) {
      const item = state.feedItemsDict[id];
      if (!item) continue;

      manifest.push({
        id,
        contentHash: item.contentHash,
        progress: item.progress,
        duration: item.duration,
      });
    }

    void dataSubscriptionActions
      .requestItemsByVisibility(
        viewId,
        visibilityFilter,
        undefined,
        undefined,
        manifest.length > 0 ? manifest : undefined,
      )
      .finally(() => {
        validatingCombos.delete(key);
      });
  }, [
    viewFilter,
    visibilityFilter,
    feedFilter,
    categoryFilter,
    manifestItemIdsKey,
  ]);
}
