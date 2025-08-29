import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useFeeds } from ".";
import { useAtom } from "jotai";
import { feedItemsMapAtom, feedItemsOrderAtom } from "../atoms";
import { useFetchNewFeedItemsMutation } from "../feed-items/mutations";

export function useCreateFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutateAsync: fetchNewFeedItems } = useFetchNewFeedItemsMutation();

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
        await fetchNewFeedItems();
      },
    }),
  );
}

export function useCreateFeedsFromSubscriptionImportMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  const { mutateAsync: fetchNewFeedItems } = useFetchNewFeedItemsMutation();

  return useMutation(
    api.feeds.createFeedsFromSubscriptionImport.mutationOptions({
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
        await fetchNewFeedItems();
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

export function useEditFeedMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feeds.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: api.feeds.getAll.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: api.feedCategories.getAll.queryKey(),
        });
      },
    }),
  );
}
