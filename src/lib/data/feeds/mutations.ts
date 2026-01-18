import { useMutation } from "@tanstack/react-query";
import { orpc } from "~/lib/orpc";
import { useFetchContentCategories } from "../content-categories/store";
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
  const fetchContentCategories = useFetchContentCategories();
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
        fetchContentCategories();
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

export function useBulkDeleteFeedsMutation() {
  const feedItemsOrder = useFeedItemsOrder();
  const feedItemsDict = useFeedItemsDict();

  const setFeedItemsOrder = feedItemsStore.useSetFeedItemsOrder();
  const setFeedItemsDict = feedItemsStore.useSetFeedItemsDict();

  const fetchFeeds = useFetchFeeds();
  const fetchFeedCategories = useFetchFeedCategories();

  return useMutation(
    orpc.feed.bulkDelete.mutationOptions({
      onSuccess: (_, { feedIds }) => {
        // Remove feed items belonging to deleted feeds
        const feedIdSet = new Set(feedIds);
        const [updatedFeedItemsOrder, removedFeedItemIds] = feedItemsOrder.reduce(
          ([keptItems, removedItems], feedItemContentId) => {
            const feedItem = feedItemsDict[feedItemContentId];
            if (feedItem && feedIdSet.has(feedItem.feedId)) {
              removedItems.push(feedItemContentId);
            } else {
              keptItems.push(feedItemContentId);
            }
            return [keptItems, removedItems];
          },
          [[], []] as [string[], string[]],
        );

        const updatedFeedItemsDict = removedFeedItemIds.reduce(
          (partialMap, feedItemContentId) => {
            delete partialMap[feedItemContentId];
            return partialMap;
          },
          { ...feedItemsDict },
        );

        setFeedItemsOrder(updatedFeedItemsOrder);
        setFeedItemsDict(updatedFeedItemsDict);

        // Refetch feeds to update the list
        fetchFeeds();
        fetchFeedCategories();
      },
    }),
  );
}
