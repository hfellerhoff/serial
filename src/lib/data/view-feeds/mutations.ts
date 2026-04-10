import { useMutation } from "@tanstack/react-query";
import { useFetchViews } from "../views/store";
import { useFetchViewFeeds } from "./store";
import { orpc } from "~/lib/orpc";

export function useAssignViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.viewFeeds.assignToView.mutationOptions({
      onSuccess: async () => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
      },
    }),
  );
}

export function useRemoveViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.viewFeeds.removeFromView.mutationOptions({
      onSuccess: async () => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
      },
    }),
  );
}

export function useBulkAssignViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.viewFeeds.bulkAssignToView.mutationOptions({
      onSuccess: async () => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
      },
    }),
  );
}

export function useBulkRemoveViewFeedMutation() {
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();

  return useMutation(
    orpc.viewFeeds.bulkRemoveFromView.mutationOptions({
      onSuccess: async () => {
        await Promise.all([fetchViewFeeds(), fetchViews()]);
      },
    }),
  );
}
