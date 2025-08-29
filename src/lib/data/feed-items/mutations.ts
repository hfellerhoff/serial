import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useFeedItemGlobalState } from "../atoms";

export function useFetchNewFeedItemsMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feedItems.fetchNewItems.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.contentCategories.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.views.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.userConfig.getConfig.queryKey(),
        });
      },
    }),
  );
}

export function useFeedItemsSetWatchedValueMutation(contentId: string) {
  const api = useTRPC();
  const [feedItem, setFeedItem] = useFeedItemGlobalState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    api.feedItems.setWatchedValue.mutationOptions({
      onMutate: ({ isWatched }) => {
        setFeedItem({
          ...feedItem,
          isWatched,
        });
      },
    }),
  );
}

export function useFeedItemsSetWatchLaterValueMutation(contentId: string) {
  const api = useTRPC();
  const [feedItem, setFeedItem] = useFeedItemGlobalState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    api.feedItems.setWatchLaterValue.mutationOptions({
      onMutate: ({ isWatchLater }) => {
        setFeedItem({
          ...feedItem,
          isWatchLater,
        });
      },
    }),
  );
}
