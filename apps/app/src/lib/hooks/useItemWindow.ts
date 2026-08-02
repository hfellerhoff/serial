"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import {
  clearRetainedEntityPins,
  getBoundedItemWindow,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";
import { getSavedHomeRenderedItemCount } from "~/lib/scroll";
import { ITEMS_PER_PAGE } from "~/server/api/constants";
import { bookmarksStore } from "~/lib/data/bookmarks/store";

function getInitialRenderCount(itemIds: string[], listKey: string) {
  const savedRenderedItemCount = getSavedHomeRenderedItemCount(listKey);
  const renderCount = savedRenderedItemCount ?? ITEMS_PER_PAGE;

  return Math.min(renderCount, itemIds.length || renderCount);
}

export function reconcileRenderCountForItems(input: {
  currentRenderCount: number;
  itemCount: number;
  renderBudget: number;
}) {
  return Math.max(
    input.currentRenderCount,
    Math.min(input.renderBudget, input.itemCount),
  );
}

export function useItemWindow(itemIds: string[], listKey: string) {
  const [renderCount, setRenderCount] = useState(() =>
    getInitialRenderCount(itemIds, listKey),
  );
  const listKeyRef = useRef(listKey);

  // Reset render count when the underlying item list changes (view switch,
  // filter change). We key off the list identity so that appending more cached
  // items to the same view does not collapse the window.
  useEffect(() => {
    if (listKeyRef.current !== listKey) {
      setRenderCount(getInitialRenderCount(itemIds, listKey));
      listKeyRef.current = listKey;
      return;
    }

    const renderBudget =
      getSavedHomeRenderedItemCount(listKey) ?? ITEMS_PER_PAGE;
    setRenderCount((currentRenderCount) =>
      reconcileRenderCountForItems({
        currentRenderCount,
        itemCount: itemIds.length,
        renderBudget,
      }),
    );
  }, [itemIds, listKey]);

  // Auto-expand window if keyboard navigation selects an item outside the
  // visible range so scroll-to-item always finds a DOM node.
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  const itemWindow = getBoundedItemWindow({
    itemIds,
    renderEnd: renderCount,
    selectedItemId,
  });
  const visibleItems = itemWindow.itemIds;

  useEffect(() => {
    const owner = `visible-list:${listKey}`;
    const bookmarkIds = visibleItems.filter((id) =>
      bookmarksStore.getState().getBookmark(id),
    );
    const bookmarkIdSet = new Set(bookmarkIds);
    setRetainedEntityPins(owner, {
      bookmarkIds,
      feedItemIds: visibleItems.filter((id) => !bookmarkIdSet.has(id)),
    });
    return () => clearRetainedEntityPins(owner);
  }, [listKey, visibleItems]);

  const expandWindow = useCallback((itemCount: number) => {
    setRenderCount((prev) => Math.min(prev + ITEMS_PER_PAGE, itemCount));
  }, []);

  return { visibleItems, expandWindow, renderCount: itemWindow.end };
}
