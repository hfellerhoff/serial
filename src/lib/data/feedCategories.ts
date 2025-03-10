import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";

export function useFeedCategoriesQuery() {
  const api = useTRPC();

  return useQuery(
    api.feedCategories.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );
}

export function useAssignFeedCategoryMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feedCategories.assignToFeed.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useRemoveFeedCategoryMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feedCategories.removeFromFeed.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}
