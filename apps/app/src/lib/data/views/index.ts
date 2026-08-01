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
import {
  createFeedItemFilterIndex,
  createFeedItemFilterPredicate,
} from "../feed-items";
import {
  getFeedItemScopeKey,
  useFeedItemsListProjection,
  useFeedItemsOrder,
  useScopeFeedItemIds,
} from "../store";
import { bookmarksStore } from "../bookmarks/store";
import { projectLocalMixedContentOrder } from "../mixed-content/bookmarkProjection";
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

export function useCheckFilteredFeedItemsForView() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsProjection = useFeedItemsListProjection();
  const scopeFeedItemIds = useScopeFeedItemIds();
  const { feedCategories } = useFeedCategories();
  const { views } = useViews();
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const filterIndex = useMemo(
    () => createFeedItemFilterIndex(feedCategories, views),
    [feedCategories, views],
  );

  return useCallback(
    (viewId: number) => {
      const viewFilter = views.find((view) => view.id === viewId) || null;
      const scopeKey = getFeedItemScopeKey("view", viewId, visibilityFilter);
      const scopedFeedItemsOrder = scopeFeedItemIds[scopeKey];
      const baseFeedItemsOrder = scopedFeedItemsOrder ?? feedItemsOrder;
      const feedItemsDict = feedItemsProjection.getItems();
      const doesFeedItemPassFilters = createFeedItemFilterPredicate({
        visibilityFilter,
        categoryFilter: -1,
        feedFilter: -1,
        viewFilter,
        filterIndex,
      });

      return baseFeedItemsOrder.filter((item) => {
        const feedItem = feedItemsDict[item];
        return !!feedItem && doesFeedItemPassFilters(feedItem);
      });
    },
    [
      feedItemsOrder,
      scopeFeedItemIds,
      feedItemsProjection,
      filterIndex,
      views,
      visibilityFilter,
    ],
  );
}

export function useCheckFilteredContentForView() {
  const checkFilteredFeedItemsForView = useCheckFilteredFeedItemsForView();
  const feedItemsProjection = useFeedItemsListProjection();
  const { feedCategories } = useFeedCategories();
  const { views } = useViews();
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const bookmarkRevision = bookmarksStore.useRevision();
  const bookmarks = useMemo(() => {
    void bookmarkRevision;
    return { ...bookmarksStore.getState().snapshot() };
  }, [bookmarkRevision]);

  return useCallback(
    (viewId: number) => {
      return projectLocalMixedContentOrder({
        feedItemIds: checkFilteredFeedItemsForView(viewId),
        feedItems: feedItemsProjection.getItems(),
        bookmarks,
        scope: { type: "view", viewId },
        views,
        visibility: visibilityFilter,
        feedCategories,
      });
    },
    [
      bookmarks,
      checkFilteredFeedItemsForView,
      feedItemsProjection,
      feedCategories,
      views,
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

  const customViewFeedIds = useMemo(() => {
    return new Set(customViews.flatMap((v) => v.feedIds));
  }, [customViews]);

  return { customViews, customViewCategoryIds, customViewFeedIds };
}
