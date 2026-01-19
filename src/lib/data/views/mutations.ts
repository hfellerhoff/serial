import { useMutation } from "@tanstack/react-query";
import { useFetchViews, useSetViews } from "./store";
import { INBOX_VIEW_ID, INBOX_VIEW_PLACEMENT } from ".";
import type { ApplicationView } from "~/server/db/schema";
import { orpc } from "~/lib/orpc";

export function useCreateViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.view.create.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
      },
    }),
  );
}

export function useEditViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.view.update.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
      },
    }),
  );
}

export function useDeleteViewMutation() {
  const setViews = useSetViews();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.view.deleteView.mutationOptions({
      onSuccess: async () => {
        setViews([]);
        await fetchViews();
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
