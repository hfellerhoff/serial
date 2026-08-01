import { useMutation } from "@tanstack/react-query";
import { useFetchViews, useSetViews, viewsStore } from "./store";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT, useUpdateViewFilter } from ".";
import type { ApplicationView } from "~/server/db/schema";
import { orpc } from "~/lib/orpc";
import { feedItemsStore, useRevalidateView } from "~/lib/data/store";
import { useFetchViewFeeds } from "~/lib/data/view-feeds/store";
import { mixedContentStore } from "~/lib/data/mixed-content/store";
import { bookmarksStore } from "~/lib/data/bookmarks/store";
import { feedCategoriesStore } from "~/lib/data/feed-categories/store";
import { refreshNavigationSnapshotSafely } from "~/lib/data/navigation/store";

export function useCreateViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();
  const fetchViewFeeds = useFetchViewFeeds();
  const revalidateView = useRevalidateView();
  const updateViewFilter = useUpdateViewFilter();

  return useMutation(
    orpc.view.create.mutationOptions({
      onSuccess: async (createdView) => {
        setViews([]);
        await fetchViews();
        await fetchViewFeeds();

        if (createdView) {
          await revalidateView(createdView.id);
          updateViewFilter(createdView.id, viewsStore.getState().views);
        }
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

/**
 * Like useCreateViewMutation but does not switch the active view filter.
 * Use when creating a view inline (e.g. from a combobox in another dialog).
 */
export function useQuickCreateViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();
  const fetchViewFeeds = useFetchViewFeeds();

  return useMutation(
    orpc.view.create.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
        await fetchViewFeeds();
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useEditViewMutation() {
  return useMutation(
    orpc.view.update.mutationOptions({
      onSuccess: async (updatedView) => {
        if (!updatedView) return;
        viewsStore.getState().update(updatedView.id, updatedView);
        const nextViews = viewsStore.getState().views;
        for (const bookmark of Object.values(
          bookmarksStore.getState().snapshot(),
        )) {
          mixedContentStore.getState().reprojectUpsert({
            bookmark,
            previousBookmark: undefined,
            feedItems: feedItemsStore.getState().feedItemsDict,
            views: nextViews,
          });
        }
        const feedItems = feedItemsStore.getState().feedItemsDict;
        mixedContentStore.getState().reprojectFeedItems({
          itemIds: Object.keys(feedItems),
          feedItems,
          bookmarks: bookmarksStore.getState().snapshot(),
          views: nextViews,
          feedCategories: feedCategoriesStore.getState().feedCategories,
        });
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useDeleteViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();
  const fetchViewFeeds = useFetchViewFeeds();
  const updateViewFilter = useUpdateViewFilter();

  return useMutation(
    orpc.view.deleteView.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
        await fetchViewFeeds();
        updateViewFilter(INBOX_VIEW_ID, viewsStore.getState().views);
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function calculateViewsPlacement(views: ApplicationView[]) {
  const inboxIndex = views.findIndex((view) => view.id === INBOX_VIEW_ID);
  if (inboxIndex === -1) return views;

  return views.map((view, viewIndex) => ({
    ...view,
    placement: inboxIndex - viewIndex + INBOX_VIEW_PLACEMENT,
  }));
}

export function useUpdateViewsPlacementMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.view.updatePlacement.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
      },
    }),
  );
}
