import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo } from "react";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  UNSELECTED_VIEW_ID,
  viewFilterIdAtom,
  viewsAtom,
  visibilityFilterAtom,
} from "../atoms";
import { useFeedCategories } from "../feed-categories";
import { doesFeedItemPassFilters } from "../feed-items";
import { useFeeds } from "../feeds";
import { useFeedItemsDict, useFeedItemsOrder } from "../store";
import { useViewsFetchStatus } from "./store";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT } from "./constants";
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

export function useCheckFilteredFeedItemsForView() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsDict = useFeedItemsDict();
  const { feedCategories } = useFeedCategories();
  const { feeds } = useFeeds();
  const { views } = useViews();
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const { customViewCategoryIds } = useCustomViewsData();

  return useCallback(
    (viewId: number) => {
      const viewFilter = views.find((view) => view.id === viewId) || null;

      return feedItemsOrder.filter(
        (item) =>
          feedItemsDict[item] &&
          doesFeedItemPassFilters(
            feedItemsDict[item],
            viewFilter?.daysWindow ?? 1,
            visibilityFilter,
            -1,
            feedCategories,
            -1,
            feeds,
            viewFilter,
            customViewCategoryIds,
          ),
      );
    },
    [
      feedItemsOrder,
      feedItemsDict,
      feedCategories,
      feeds,
      views,
      customViewCategoryIds,
      visibilityFilter,
    ],
  );
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

  return { customViews, customViewCategoryIds };
}
