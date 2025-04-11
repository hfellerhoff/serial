import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type DatabaseFeedItem } from "~/server/db/schema";
import { useTRPC } from "~/trpc/react";
import { Atom, useAtom, useSetAtom } from "jotai";
import {
  FeedItemAtom,
  FeedItemStateSetter,
  useFeedItemGlobalState,
} from "../atoms";

export function useFetchNewFeedItemsMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feedItems.fetchNewItems.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
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
