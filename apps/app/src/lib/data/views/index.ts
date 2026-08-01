import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  UNSELECTED_VIEW_ID,
  viewFilterIdAtom,
  viewsAtom,
} from "../atoms";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT } from "./constants";
import { useViewsFetchStatus } from "./store";
import type { ApplicationView } from "~/server/db/schema";

export { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT };

export function useDeselectViewFilter() {
  const setViewFilter = useSetAtom(viewFilterIdAtom);
  return useCallback(() => {
    setViewFilter(UNSELECTED_VIEW_ID);
  }, [setViewFilter]);
}

export function useUpdateViewFilter() {
  const views = useAtomValue(viewsAtom);
  const [, setViewFilter] = useAtom(viewFilterIdAtom);

  const setFeedFilter = useSetAtom(feedFilterAtom);
  const setDateFilter = useSetAtom(dateFilterAtom);
  const setCategoryFilter = useSetAtom(categoryFilterAtom);

  const updateViewFilter = (
    viewId: number,
    updatedViews?: ApplicationView[],
  ) => {
    const _views = updatedViews ?? views;
    const view = _views.find((v) => v.id === viewId);

    if (!view) return;

    setFeedFilter(-1);
    setCategoryFilter(-1);
    setDateFilter(view.daysWindow);
    setViewFilter(view.id);
  };

  return updateViewFilter;
}

export function useViews() {
  const views = useAtomValue(viewsAtom);
  const fetchStatus = useViewsFetchStatus();

  return {
    views,
    hasFetchedViews: fetchStatus === "success",
  };
}

/**
 * Hook to compute custom views (non-Uncategorized) and their category IDs.
 * Use this to avoid duplicating this computation across multiple hooks.
 */
export function useCustomViewsData() {
  const views = useAtomValue(viewsAtom);

  const customViews = useMemo(() => {
    return views.filter((v) => v.id !== INBOX_VIEW_ID);
  }, [views]);

  const customViewCategoryIds = useMemo(() => {
    return new Set(customViews.flatMap((v) => v.categoryIds));
  }, [customViews]);

  const customViewFeedIds = useMemo(() => {
    return new Set(customViews.flatMap((v) => v.feedIds));
  }, [customViews]);

  return { customViews, customViewCategoryIds, customViewFeedIds };
}
