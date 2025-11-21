import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useFeeds } from ".";
import { useAtom } from "jotai";
import { feedItemsMapAtom, feedItemsOrderAtom } from "../atoms";
import { orpc } from "~/lib/orpc";

export function useCreateFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    orpc.feed.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.feedItem.getAll.queryKey(),
        });
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

  return useMutation(
    orpc.feed.createFromSubscriptionImport.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.feed.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.feedItem.getAll.queryKey(),
        });
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
  const [feedItemsOrder, setFeedItemsOrder] = useAtom(feedItemsOrderAtom);
  const [feedItemsMap, setFeedItemsMap] = useAtom(feedItemsMapAtom);

  return useMutation(
    orpc.feed.delete.mutationOptions({
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
          queryKey: orpc.feed.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.feedItem.getAll.queryKey(),
        });
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
