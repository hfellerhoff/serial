"use client";

import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { selectedItemIdAtom } from "~/lib/data/atoms";
import { getSavedHomeRenderedItemCount } from "~/lib/scroll";
import { ITEMS_PER_PAGE } from "~/server/api/constants";

function getInitialRenderCount(itemIds: string[], listKey: string) {
  const savedRenderedItemCount = getSavedHomeRenderedItemCount(listKey);
  const renderCount = savedRenderedItemCount ?? ITEMS_PER_PAGE;

  return Math.min(renderCount, itemIds.length || renderCount);
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
    }
  }, [itemIds, listKey]);

  const visibleItems = itemIds.slice(0, renderCount);

  // Auto-expand window if keyboard navigation selects an item outside the
  // visible range so scroll-to-item always finds a DOM node.
  const selectedItemId = useAtomValue(selectedItemIdAtom);
  useEffect(() => {
    if (!selectedItemId) return;
    const index = itemIds.indexOf(selectedItemId);
    if (index >= 0 && index >= renderCount) {
      setRenderCount((prev) =>
        Math.min(Math.max(prev, index + ITEMS_PER_PAGE), itemIds.length),
      );
    }
  }, [selectedItemId, itemIds, renderCount]);

  const expandWindow = useCallback((itemCount: number) => {
    setRenderCount((prev) => Math.min(prev + ITEMS_PER_PAGE, itemCount));
  }, []);

  return { visibleItems, expandWindow, renderCount };
}
