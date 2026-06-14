import { useMutation } from "@tanstack/react-query";
import { feedItemsStore, useFeedItemState } from "../store";
import { orpc, orpcRouterClient } from "~/lib/orpc";

type BulkWatchedItem = {
  id: string;
  feedId: number;
};

function applyBulkWatchedValue({
  items,
  isWatched,
}: {
  items: BulkWatchedItem[];
  isWatched: boolean;
}) {
  const store = feedItemsStore.getState();
  items.forEach(({ id }) => {
    const feedItem = store.feedItemsDict[id];
    if (feedItem) {
      store.setFeedItem(id, {
        ...feedItem,
        isWatched,
        isWatchedUpdatedAt: isWatched ? new Date() : null,
      });
    }
  });
}

export async function setBulkWatchedValue({
  items,
  isWatched,
}: {
  items: BulkWatchedItem[];
  isWatched: boolean;
}) {
  await orpcRouterClient.feedItem.setBulkWatchedValue({ items, isWatched });
  applyBulkWatchedValue({ items, isWatched });
}

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
          isWatchedUpdatedAt: isWatched ? new Date() : null,
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
          isWatchLaterUpdatedAt: new Date(),
        });
      },
    }),
  );
}

export function useSetProgressMutation(contentId: string) {
  const [feedItem, setFeedItem] = useFeedItemState(contentId);

  return useMutation(
    orpc.feedItem.setProgress.mutationOptions({
      onMutate: ({ progress, duration }) => {
        if (!feedItem) return;
        setFeedItem({ ...feedItem, progress, duration });
      },
    }),
  );
}

export function useBulkSetWatchedValueMutation() {
  return useMutation(
    orpc.feedItem.setBulkWatchedValue.mutationOptions({
      onSuccess: (_data, { items, isWatched }) => {
        applyBulkWatchedValue({ items, isWatched });
      },
    }),
  );
}
