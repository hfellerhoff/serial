import { useQuery } from "@tanstack/react-query";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import { useSession } from "~/lib/auth-client";
import { FEED_ITEM_ORIENTATION, VIEW_READ_STATUS } from "~/server/db/constants";
import { ApplicationView, contentCategories } from "~/server/db/schema";
import { useTRPC } from "~/trpc/react";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedFilterAtom,
  hasFetchedViewsAtom,
  viewFilterIdAtom,
  viewsAtom,
} from "../atoms";
import { useContentCategories } from "../content-categories";

export const UNSELECTED_VIEW_ID = -100;
export function useDeselectViewFilter() {
  const setViewFilter = useSetAtom(viewFilterIdAtom);
  return useCallback(() => {
    setViewFilter(UNSELECTED_VIEW_ID);
  }, [setViewFilter]);
}

export function useUpdateViewFilter() {
  const views = useAtomValue(viewsAtom);
  const [viewFilter, setViewFilter] = useAtom(viewFilterIdAtom);

  const setFeedFilter = useSetAtom(feedFilterAtom);
  const setDateFilter = useSetAtom(dateFilterAtom);
  const setCategoryFilter = useSetAtom(categoryFilterAtom);

  const updateViewFilter = (
    viewId: number,
    updatedViews?: ApplicationView[],
  ) => {
    const _views = updatedViews ?? views;
    const view = _views?.find((view) => view.id === viewId);

    if (!view) return;

    setFeedFilter(-1);
    setCategoryFilter(-1);
    setDateFilter(view.daysWindow);
    setViewFilter(view.id);
  };

  return updateViewFilter;
}

export function useViewsQuery() {
  const { data } = useSession();
  const { contentCategories } = useContentCategories();
  const setHasFetchedViews = useSetAtom(hasFetchedViewsAtom);
  const setViews = useSetAtom(viewsAtom);
  const updateViewFilter = useUpdateViewFilter();

  const query = useQuery(
    useTRPC().views.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  const transformedData = useMemo(() => {
    const now = new Date();

    const customViews: ApplicationView[] = (query.data ?? []).map((view) => ({
      ...view,
    }));

    const allCategoryIdsSet = new Set(
      contentCategories.map((category) => category.id),
    );
    const customViewCategoryIdsSet = new Set(
      customViews.flatMap((view) => view.categoryIds),
    );

    const inboxViewCategoryIds = allCategoryIdsSet.difference(
      customViewCategoryIdsSet,
    );

    const inboxView: ApplicationView = {
      id: -1,
      name: "Inbox",
      daysWindow: 7,
      orientation: FEED_ITEM_ORIENTATION.HORIZONTAL,
      readStatus: VIEW_READ_STATUS.UNREAD,
      placement: -1,
      userId: data?.user.id ?? "",
      createdAt: now,
      updatedAt: now,
      categoryIds: Array.from(inboxViewCategoryIds),
      isDefault: true,
    };

    return [...customViews, inboxView];
  }, [query.data]);

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedViews(true);
      setViews(transformedData);
      if (!!transformedData?.[0]?.id) {
        updateViewFilter(transformedData[0].id, transformedData);
      }
    }
  }, [query.isSuccess, transformedData]);

  return {
    ...query,
    data: transformedData,
  };
}

export function useViews() {
  const [views, setViews] = useAtom(viewsAtom);
  const hasFetchedViews = useAtomValue(hasFetchedViewsAtom);
  const viewsQuery = useViewsQuery();

  return {
    views,
    setViews,
    viewsQuery,
    hasFetchedViews,
  };
}
