"use client";

import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  categoryFilterAtom,
  feedFilterAtom,
  UNSELECTED_VIEW_ID,
  viewFilterIdAtom,
  viewsAtom,
} from "./atoms";
import { useUpdateViewFilter } from "./views";
import { feedItemsStore, useCurrentViewId, useHasInitialData } from "./store";
import { useViewsFetchStatus, useViews as useViewsStore } from "./views/store";
import { useDataSubscription } from "./useDataSubscription";
import { useStoresHydrated } from "./hydration";
import type { PropsWithChildren } from "react";

export function InitialClientQueries({ children }: PropsWithChildren) {
  const { requestInitialData } = useDataSubscription();
  const currentViewId = useCurrentViewId();
  const hasInitialData = useHasInitialData();
  const hasSetInitialView = useRef(false);
  const hasRequestedInitialData = useRef(false);
  const hydrated = useStoresHydrated();

  // Sync views store with viewsAtom for compatibility
  const viewsFromStore = useViewsStore();
  const viewsFetchStatus = useViewsFetchStatus();
  const setViewsAtom = useSetAtom(viewsAtom);
  const updateViewFilter = useUpdateViewFilter();

  // Read filter atoms for auto-selection logic
  const viewFilterId = useAtomValue(viewFilterIdAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);

  // Request initial data once stores have hydrated from IDB.
  // Gating on hydration ensures cached data is loaded first, preventing
  // fresh SSE data from being overwritten by a late hydration merge.
  // If the client has cached feed items, request a lightweight manifest
  // instead of full items so the server only sends what changed.
  useEffect(() => {
    if (!hasRequestedInitialData.current && hydrated) {
      hasRequestedInitialData.current = true;
      const hasCachedData =
        Object.keys(feedItemsStore.getState().feedItemsDict).length > 0;
      void requestInitialData(
        hasCachedData ? { hasCachedData: true } : undefined,
      );
    }
  }, [requestInitialData, hydrated]);

  // Keep viewsAtom always in sync with store
  useEffect(() => {
    if (viewsFetchStatus === "success" && viewsFromStore.length > 0) {
      setViewsAtom(viewsFromStore);
    }
  }, [viewsFetchStatus, viewsFromStore, setViewsAtom]);

  // Set initial view filter once when initial data is ready
  useEffect(() => {
    if (
      !hasSetInitialView.current &&
      hasInitialData &&
      viewsFetchStatus === "success" &&
      viewsFromStore.length > 0 &&
      currentViewId !== null
    ) {
      hasSetInitialView.current = true;
      updateViewFilter(currentViewId, viewsFromStore);
    }
  }, [
    hasInitialData,
    viewsFetchStatus,
    viewsFromStore,
    currentViewId,
    updateViewFilter,
  ]);

  // Auto-select first view when nothing is selected
  useEffect(() => {
    const nothingSelected =
      viewFilterId === UNSELECTED_VIEW_ID &&
      feedFilter === -1 &&
      categoryFilter === -1;

    if (nothingSelected && viewsFromStore.length > 0) {
      const firstView = viewsFromStore[0];
      if (firstView) {
        updateViewFilter(firstView.id, viewsFromStore);
      }
    }
  }, [
    viewFilterId,
    feedFilter,
    categoryFilter,
    viewsFromStore,
    updateViewFilter,
  ]);

  return children;
}
