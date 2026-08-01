import { useMutation } from "@tanstack/react-query";
import { useFetchFeedCategories } from "./store";
import { orpc } from "~/lib/orpc";
import { refreshNavigationSnapshotSafely } from "~/lib/data/navigation/store";

export function useBulkAssignFeedCategoryMutation() {
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.feedCategories.bulkAssignToFeeds.mutationOptions({
      onSuccess: async () => {
        await fetchFeedCategories();
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}

export function useBulkRemoveFeedCategoryMutation() {
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.feedCategories.bulkRemoveFromFeeds.mutationOptions({
      onSuccess: async () => {
        await fetchFeedCategories();
        await refreshNavigationSnapshotSafely();
      },
    }),
  );
}
