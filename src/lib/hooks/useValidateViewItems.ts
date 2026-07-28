"use client";

import { useEffect, useRef } from "react";
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
 *
 * The manifest is stored in a ref so that optimistic item removals (e.g.
 * marking an item as read) do NOT re-trigger validation — only view/filter
 * changes do. Individual mutations broadcast their confirmed state back
 * through the SSE channel directly.
 */
export function useValidateViewItems() {
  const viewFilter = useAtomValue(viewFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const filteredItemIds = useFilteredFeedItemsOrder();

  // Keep the latest filtered ids in a ref so building the manifest never makes
  // them an effect dependency. Re-running validation on every item-list change
  // is what we explicitly want to avoid: a validation diff replaces the view
  // scope with just its first page (`replacesScope`), so re-validating after
  // pagination would drop the paginated items. Only view/filter changes should
  // trigger validation.
  const filteredItemIdsRef = useRef(filteredItemIds);
  useEffect(() => {
    filteredItemIdsRef.current = filteredItemIds;
  }, [filteredItemIds]);

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
    const manifestItemIds = filteredItemIdsRef.current.slice(0, ITEMS_PER_PAGE);
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
  }, [viewFilter, visibilityFilter, feedFilter, categoryFilter]);
}
