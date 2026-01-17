import { useMutation } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";
import { useFetchFeedCategories } from "../feed-categories/store";
import {
  feedItemsStore,
  useFeedItemsDict,
  useFeedItemsOrder,
  useFetchFeedItems,
  useFetchFeedItemsForFeed,
} from "../store";
import {
  useAddFeed,
  useFetchFeeds,
  useRemoveFeed,
  useSetFeeds,
  useUpdateFeed,
} from "./store";

export function useCreateFeedMutation() {
  const fetchFeedItemsForFeed = useFetchFeedItemsForFeed();
  const fetchFeedCategories = useFetchFeedCategories();
  const addFeed = useAddFeed();

  return useMutation(
    orpc.feed.create.mutationOptions({
      onSuccess: async (createdFeeds) => {
        createdFeeds.forEach((feed) => addFeed(feed));
        await Promise.all(createdFeeds.map((feed) => fetchFeedItemsForFeed(feed.id)));
        await fetchFeedCategories();
      },
    }),
  );
}

export function useCreateFeedsFromSubscriptionImportMutation() {
  const refetchFeedItems = useFetchFeedItems();
  const fetchFeedCategories = useFetchFeedCategories();
  const setFeeds = useSetFeeds();
  const fetchFeeds = useFetchFeeds();

  return useMutation(
    orpc.feed.createFromSubscriptionImport.mutationOptions({
      onSuccess: async () => {
        // Reset and refetch feeds
        setFeeds([]);
        fetchFeeds();
        refetchFeedItems();
        fetchFeedCategories();
      },
    }),
  );
}

export function useDeleteFeedMutation() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsDict = useFeedItemsDict();

  const setFeedItemsOrder = feedItemsStore.useSetFeedItemsOrder();
  const setFeedItemsDict = feedItemsStore.useSetFeedItemsDict();

  const removeFeed = useRemoveFeed();

  return useMutation(
    orpc.feed.delete.mutationOptions({
      onSuccess: (_, feedId) => {
        removeFeed(feedId);

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
      },
    }),
  );
}

export function useEditFeedMutation() {
  const fetchFeedCategories = useFetchFeedCategories();
  const updateFeed = useUpdateFeed();

  return useMutation(
    orpc.feed.update.mutationOptions({
      onSuccess: async (updatedFeed) => {
        if (updatedFeed) {
          updateFeed(updatedFeed.id, updatedFeed);
        }
        await fetchFeedCategories();
      },
    }),
  );
}
