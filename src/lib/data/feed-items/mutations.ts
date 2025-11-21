import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useFeedItemGlobalState } from "../atoms";
import { orpc } from "~/lib/orpc";

export function useFeedItemsSetWatchedValueMutation(contentId: string) {
  const [feedItem, setFeedItem] = useFeedItemGlobalState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    orpc.feedItem.setWatchedValue.mutationOptions({
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
  const [feedItem, setFeedItem] = useFeedItemGlobalState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    orpc.feedItem.setWatchLaterValue.mutationOptions({
      onMutate: ({ isWatchLater }) => {
        setFeedItem({
          ...feedItem,
          isWatchLater,
        });
      },
    }),
  );
}
