import { useMutation } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";
import { useFetchFeedCategories } from "./store";

export function useAssignFeedCategoryMutation() {
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.feedCategories.assignToFeed.mutationOptions({
      onSuccess: async () => {
        await fetchFeedCategories();
      },
    }),
  );
}

export function useRemoveFeedCategoryMutation() {
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.feedCategories.removeFromFeed.mutationOptions({
      onSuccess: async () => {
        await fetchFeedCategories();
      },
    }),
  );
}
