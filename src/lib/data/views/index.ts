import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  UNSELECTED_VIEW_ID,
  viewFilterIdAtom,
  viewsAtom,
} from "../atoms";
import { useContentCategories } from "../content-categories";
import { useFeedCategories } from "../feed-categories";
import { doesFeedItemPassFilters } from "../feed-items";
import { useFeeds } from "../feeds";
import { useFeedItemsDict, useFeedItemsOrder } from "../store";
import { sortViewsByPlacement } from "./utils";
import {
  useFetchViews,
  useSetViews,
  useViewsFetchStatus,
  useViews as useViewsStore,
} from "./store";
import type { ApplicationView } from "~/server/db/schema";
import { FEED_ITEM_ORIENTATION, VIEW_READ_STATUS } from "~/server/db/constants";
import { useSession } from "~/lib/auth-client";

export const INBOX_VIEW_ID = -1;
export const INBOX_VIEW_PLACEMENT = -1;

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

  return useCallback(
    (viewId: number) => {
      const viewFilter = views.find((view) => view.id === viewId) || null;

      return feedItemsOrder.filter(
        (item) =>
          feedItemsDict[item] &&
          doesFeedItemPassFilters(
            feedItemsDict[item],
            viewFilter?.daysWindow ?? 1,
            "unread",
            -1,
            feedCategories,
            -1,
            feeds,
            viewFilter,
          ),
      );
    },
    [feedItemsOrder, feedItemsDict, feedCategories, feeds, views],
  );
}

export function useViewsQuery() {
  const { data } = useSession();
  const { contentCategories } = useContentCategories();
  const rawViews = useViewsStore();
  const fetchStatus = useViewsFetchStatus();
  const fetchViews = useFetchViews();
  const setViewsInStore = useSetViews();
  const setViewsAtom = useSetAtom(viewsAtom);

  useEffect(() => {
    if (fetchStatus === "idle") {
      void fetchViews();
    }
  }, [fetchStatus, fetchViews]);

  const transformedData = useMemo(() => {
    const now = new Date();

    const customViews: ApplicationView[] = rawViews.map((view) => ({
      ...view,
    }));

    const allCategoryIdsSet = new Set(
      contentCategories.map((category) => category.id),
    );
    const customViewCategoryIdsSet = new Set(
      customViews.flatMap((view) => view.categoryIds),
    );

    const inboxViewCategoryIds = new Set(
      [...allCategoryIdsSet].filter((id) => !customViewCategoryIdsSet.has(id)),
    );

    const inboxView: ApplicationView = {
      id: INBOX_VIEW_ID,
      name: "Inbox",
      daysWindow: 30,
      orientation: FEED_ITEM_ORIENTATION.HORIZONTAL,
      readStatus: VIEW_READ_STATUS.UNREAD,
      placement: INBOX_VIEW_PLACEMENT,
      userId: data?.user.id ?? "",
      createdAt: now,
      updatedAt: now,
      categoryIds: Array.from(inboxViewCategoryIds),
      isDefault: true,
    };

    return sortViewsByPlacement([...customViews, inboxView]);
  }, [rawViews, contentCategories, data?.user.id]);

  // Keep the Jotai atom in sync with the computed views (including Inbox)
  useEffect(() => {
    if (fetchStatus === "success") {
      setViewsAtom(transformedData);
    }
  }, [fetchStatus, transformedData, setViewsAtom]);

  return {
    isLoading: fetchStatus === "fetching",
    isSuccess: fetchStatus === "success",
    data: transformedData,
    refetch: async () => {
      // Reset and fetch again
      setViewsInStore([]);
      await fetchViews();
    },
  };
}

export function useViews() {
  const views = useAtomValue(viewsAtom);
  const fetchStatus = useViewsFetchStatus();
  const viewsQuery = useViewsQuery();

  return {
    views,
    viewsQuery,
    hasFetchedViews: fetchStatus === "success",
  };
}
