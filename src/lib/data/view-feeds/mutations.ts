import { useMutation } from "@tanstack/react-query";
import { useFetchViews } from "../views/store";
import { useFetchViewFeeds } from "./store";
import { useRevalidateView } from "~/lib/data/store";
import { orpc } from "~/lib/orpc";

export function useAssignViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const revalidateView = useRevalidateView();

  return useMutation(
    orpc.viewFeeds.assignToView.mutationOptions({
      onSuccess: async (_, { viewId }) => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
        await revalidateView(viewId);
      },
    }),
  );
}

export function useRemoveViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const revalidateView = useRevalidateView();

  return useMutation(
    orpc.viewFeeds.removeFromView.mutationOptions({
      onSuccess: async (_, { viewId }) => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
        await revalidateView(viewId);
      },
    }),
  );
}

export function useBulkAssignViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const revalidateView = useRevalidateView();

  return useMutation(
    orpc.viewFeeds.bulkAssignToView.mutationOptions({
      onSuccess: async (_, { viewId }) => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
        await revalidateView(viewId);
      },
    }),
  );
}

export function useBulkRemoveViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const revalidateView = useRevalidateView();

  return useMutation(
    orpc.viewFeeds.bulkRemoveFromView.mutationOptions({
      onSuccess: async (_, { viewId }) => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
        await revalidateView(viewId);
      },
    }),
  );
}
