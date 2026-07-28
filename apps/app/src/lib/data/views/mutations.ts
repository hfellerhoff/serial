import { useMutation } from "@tanstack/react-query";
import { useFetchViews, useSetViews, viewsStore } from "./store";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT, useUpdateViewFilter } from ".";
import type { ApplicationView } from "~/server/db/schema";
import { orpc } from "~/lib/orpc";
import { useRevalidateView } from "~/lib/data/store";
import { useFetchViewFeeds } from "~/lib/data/view-feeds/store";

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
      },
    }),
  );
}

export function useEditViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();
  const fetchViewFeeds = useFetchViewFeeds();

  return useMutation(
    orpc.view.update.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
        await fetchViewFeeds();
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
