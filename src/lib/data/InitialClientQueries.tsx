"use client";

import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { viewsAtom } from "./atoms";
import { useUpdateViewFilter } from "./views";
import { useCurrentViewId, useFetchByView, useHasInitialData } from "./store";
import { useViewsFetchStatus, useViews as useViewsStore } from "./views/store";
import type { PropsWithChildren } from "react";

export function InitialClientQueries({ children }: PropsWithChildren) {
  const fetchByView = useFetchByView();
  const currentViewId = useCurrentViewId();
  const hasInitialData = useHasInitialData();
  const hasSetInitialView = useRef(false);

  // Sync views store with viewsAtom for compatibility
  const viewsFromStore = useViewsStore();
  const viewsFetchStatus = useViewsFetchStatus();
  const setViewsAtom = useSetAtom(viewsAtom);
  const updateViewFilter = useUpdateViewFilter();

  useEffect(() => {
    void fetchByView();
  }, []);

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

  return children;
}
