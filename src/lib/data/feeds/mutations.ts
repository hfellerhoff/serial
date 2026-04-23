import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFetchContentCategories } from "../content-categories/store";
import { useFetchFeedCategories } from "../feed-categories/store";
import { useFetchViewFeeds } from "../view-feeds/store";
import { useFetchViews } from "../views/store";
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
import { useDialogStore } from "~/components/feed/dialogStore";
import { orpc } from "~/lib/orpc";

export function useCreateFeedMutation() {
  const fetchFeedItemsForFeed = useFetchFeedItemsForFeed();
  const fetchFeedCategories = useFetchFeedCategories();
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const addFeed = useAddFeed();

  return useMutation(
    orpc.feed.create.mutationOptions({
      onSuccess: async (result) => {
        result.feeds.forEach((feed) => addFeed(feed));
        await Promise.all(
          result.feeds.map((feed) => fetchFeedItemsForFeed(feed.id)),
        );
        await fetchFeedCategories();
        await fetchViewFeeds();
        await fetchViews();

        if (result.deactivatedCount > 0) {
          toast.warning(
            `${result.deactivatedCount} feed${result.deactivatedCount > 1 ? "s were" : " was"} added as inactive. To unlock more active feeds, you can switch to a higher plan.`,
            {
              action: {
                label: "Upgrade",
                onClick: () =>
                  useDialogStore.getState().launchDialog("subscription", {
                    subscriptionView: "picker",
                  }),
              },
            },
          );
        }
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
      onSuccess: () => {
        // Reset and refetch feeds
        setFeeds([]);
        void fetchFeeds();
        void refetchFeedItems();
        void fetchFeedCategories();
        void fetchContentCategories();
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
  const fetchViewFeeds = useFetchViewFeeds();
  const fetchViews = useFetchViews();
  const updateFeed = useUpdateFeed();

  return useMutation(
    orpc.feed.update.mutationOptions({
      onSuccess: async (updatedFeed) => {
        if (updatedFeed) {
          updateFeed(updatedFeed.id, updatedFeed);
        }
        await Promise.all([
          fetchFeedCategories(),
          fetchViewFeeds(),
          fetchViews(),
        ]);
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
        const [updatedFeedItemsOrder, removedFeedItemIds] =
          feedItemsOrder.reduce(
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
        void fetchFeeds();
        void fetchFeedCategories();
      },
    }),
  );
}

export function useSetFeedActiveMutation() {
  const updateFeed = useUpdateFeed();
  const queryClient = useQueryClient();

  return useMutation(
    orpc.feed.setActive.mutationOptions({
      onSuccess: (updatedFeed) => {
        if (updatedFeed) {
          updateFeed(updatedFeed.id, updatedFeed);
        }
        // Invalidate subscription query so active count updates
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
        });
      },
    }),
  );
}

export function useBulkSetActiveMutation() {
  const fetchFeeds = useFetchFeeds();
  const queryClient = useQueryClient();

  return useMutation(
    orpc.feed.bulkSetActive.mutationOptions({
      onSuccess: () => {
        void fetchFeeds();
        void queryClient.invalidateQueries({
          queryKey: orpc.subscription.getStatus.queryOptions().queryKey,
        });
      },
    }),
  );
}
