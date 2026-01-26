import { useMutation } from "@tanstack/react-query";
import { feedItemsStore, useFeedItemState } from "../store";
import { orpc } from "~/lib/orpc";

export function useFeedItemsSetWatchedValueMutation(contentId: string) {
  const [feedItem, setFeedItem] = useFeedItemState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    orpc.feedItem.setWatchedValue.mutationOptions({
      onMutate: ({ isWatched }) => {
        if (!feedItem) return;
        setFeedItem({
          ...feedItem,
          isWatched,
        });
      },
    }),
  );
}

export function useFeedItemsSetWatchLaterValueMutation(contentId: string) {
  const [feedItem, setFeedItem] = useFeedItemState(contentId);

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    orpc.feedItem.setWatchLaterValue.mutationOptions({
      onMutate: ({ isWatchLater }) => {
        if (!feedItem) return;
        setFeedItem({
          ...feedItem,
          isWatchLater,
        });
      },
    }),
  );
}

export function useBulkSetWatchedValueMutation() {
  return useMutation(
    orpc.feedItem.setBulkWatchedValue.mutationOptions({
      onSuccess: (_data, { items, isWatched }) => {
        const store = feedItemsStore.getState();
        const newDict = { ...store.feedItemsDict };
        items.forEach(({ id }) => {
          if (newDict[id]) {
            newDict[id] = { ...newDict[id], isWatched };
          }
        });
        store.setFeedItemsDict(newDict);
      },
    }),
  );
}
