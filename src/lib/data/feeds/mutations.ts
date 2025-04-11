import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { FETCH_NEW_FEED_ITEMS_KEY } from "../feed-items";
import { useFeeds } from ".";
import { useAtom } from "jotai";
import { feedItemsMapAtom, feedItemsOrderAtom } from "../atoms";

export function useCreateFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feeds.create.mutationOptions({
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
          queryKey: FETCH_NEW_FEED_ITEMS_KEY,
        });
      },
    }),
  );
}

export function useCreateFeedsFromSubscriptionImportMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feeds.createFeedsFromSubscriptionImport.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: FETCH_NEW_FEED_ITEMS_KEY,
        });
        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useDeleteFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { feeds, setFeeds } = useFeeds();
  const [feedItemsOrder, setFeedItemsOrder] = useAtom(feedItemsOrderAtom);
  const [feedItemsMap, setFeedItemsMap] = useAtom(feedItemsMapAtom);

  return useMutation(
    api.feeds.delete.mutationOptions({
      onSuccess: async (_, feedId) => {
        setFeeds(feeds.filter((feed) => feed.id !== feedId));

        const [updatedFeedItemsOrder, removedFeedItems] = feedItemsOrder.reduce(
          ([partialKeptItems, partialRemovedItems], feedItemContentId) => {
            if (feedItemsMap[feedItemContentId]?.feedId === feedId) {
              partialRemovedItems.push(feedItemContentId);
            } else {
              partialKeptItems.push(feedItemContentId);
            }

            return [partialKeptItems, partialRemovedItems];
          },
          [[], []] as [string[], string[]],
        );

        const updatedFeedItemsMap = removedFeedItems.reduce(
          (partialMap, feedItemContentId) => {
            delete partialMap[feedItemContentId];
            return partialMap;
          },
          { ...feedItemsMap },
        );

        setFeedItemsOrder(updatedFeedItemsOrder);
        setFeedItemsMap(updatedFeedItemsMap);

        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
      },
    }),
  );
}
