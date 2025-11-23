import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useFeeds } from ".";
import { orpc } from "~/lib/orpc";
import {
  feedItemsStore,
  useFeedItemsDict,
  useFeedItemsOrder,
  useFetchFeedItems,
} from "../store";

export function useCreateFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const refetchFeedItems = useFetchFeedItems();

  return useMutation(
    orpc.feed.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        refetchFeedItems();
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useCreateFeedsFromSubscriptionImportMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();
  const refetchFeedItems = useFetchFeedItems();

  return useMutation(
    orpc.feed.createFromSubscriptionImport.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        refetchFeedItems();
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useDeleteFeedMutation() {
  const queryClient = useQueryClient();

  const { feeds, setFeeds } = useFeeds();

  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsDict = useFeedItemsDict();

  const setFeedItemsOrder = feedItemsStore.useSetFeedItemsOrder();
  const setFeedItemsDict = feedItemsStore.useSetFeedItemsDict();

  const refetchFeedItems = useFetchFeedItems();

  return useMutation(
    orpc.feed.delete.mutationOptions({
      onSuccess: async (_, feedId) => {
        setFeeds(feeds.filter((feed) => feed.id !== feedId));

        const [updatedFeedItemsOrder, removedFeedItems] = feedItemsOrder.reduce(
          ([partialKeptItems, partialRemovedItems], feedItemContentId) => {
            if (feedItemsDict[feedItemContentId]?.feedId === feedId) {
              partialRemovedItems.push(feedItemContentId);
            } else {
              partialKeptItems.push(feedItemContentId);
            }

            return [partialKeptItems, partialRemovedItems];
          },
          [[], []] as [string[], string[]],
        );

        const updatedfeedItemsDict = removedFeedItems.reduce(
          (partialMap, feedItemContentId) => {
            delete partialMap[feedItemContentId];
            return partialMap;
          },
          { ...feedItemsDict },
        );

        setFeedItemsOrder(updatedFeedItemsOrder);
        setFeedItemsDict(updatedfeedItemsDict);

        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        refetchFeedItems();
      },
    }),
  );
}

export function useEditFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    orpc.feed.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}
