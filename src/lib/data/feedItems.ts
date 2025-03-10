import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseFeedItem } from "~/server/db/schema";
import { useTRPC } from "~/trpc/react";
import { VisibilityFilter } from "./FeedProvider";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import {
  categoryFilterAtom,
  dateFilterAtom,
  visibilityFilterAtom,
} from "./atoms";

function doesItemMatchFilters(
  item: DatabaseFeedItem,
  dateFilter: number,
  visibilityFilter: VisibilityFilter,
  categoryFilter: number | null,
) {
  const date = new Date(item.postedAt);
  const now = new Date();
  const sevenDaysAgo = new Date(
    now.setDate(now.getDate() - (Number.isNaN(dateFilter) ? 1 : dateFilter)),
  );

  // Date filter
  if (date <= sevenDaysAgo) return false;

  // Visibility filter
  if (visibilityFilter === "unread" && (item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "later" && !item.isWatchLater) {
    return false;
  }

  // Category filter
  // if (!!categoryFilter && item.content_categories?.name !== categoryFilter) {
  //   return false;
  // }

  return true;
}

export function useFilteredFeedItems(items: DatabaseFeedItem[] | undefined) {
  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);

  return useMemo(() => {
    if (!items) return [];
    return items.filter((item) =>
      doesItemMatchFilters(item, dateFilter, visibilityFilter, categoryFilter),
    );
  }, [items, dateFilter, visibilityFilter, categoryFilter]);
}

export function useFeedItemsQuery() {
  const api = useTRPC();

  return useQuery(
    api.feedItems.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );
}

export function useFetchNewFeedItemsMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    api.feedItems.fetchNewItems.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: api.feedItems.getAll.queryKey(),
        });
      },
    }),
  );
}

export function useFeedItemsSetWatchedValueMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    api.feedItems.setWatchedValue.mutationOptions({
      onMutate: ({ contentId, isWatched }) => {
        console.log("mutate");
        const previousFeedItems: undefined | DatabaseFeedItem[] =
          queryClient.getQueryData(api.feedItems.getAll.queryKey());
        console.log("previous", previousFeedItems);
        if (!previousFeedItems) return;

        const indexToUpdate = previousFeedItems.findIndex(
          (item) => item.contentId === contentId,
        );
        console.log("index", indexToUpdate);
        if (!previousFeedItems?.[indexToUpdate]) return;

        const updatedFeedItems = [...previousFeedItems];
        updatedFeedItems[indexToUpdate] = {
          ...previousFeedItems[indexToUpdate],
          isWatched,
        };

        queryClient.setQueryData(
          api.feedItems.getAll.queryKey(),
          updatedFeedItems,
        );

        return { previousFeedItems };
      },
      onError: (_err, _variables, context) => {
        queryClient.setQueryData(["todos"], context?.previousFeedItems);
      },
    }),
  );
}

export function useFeedItemsSetWatchLaterValueMutation() {
  const api = useTRPC();
  const queryClient = useQueryClient();

  // We're not refetching on success here, as the frequency of
  // toggling this value makes it very wasteful
  return useMutation(
    api.feedItems.setWatchLaterValue.mutationOptions({
      onMutate: ({ contentId, isWatchLater }) => {
        const previousFeedItems: undefined | DatabaseFeedItem[] =
          queryClient.getQueryData(api.feedItems.getAll.queryKey());
        if (!previousFeedItems) return;

        const indexToUpdate = previousFeedItems.findIndex(
          (item) => item.contentId === contentId,
        );
        if (!previousFeedItems?.[indexToUpdate]) return;

        const updatedFeedItems = [...previousFeedItems];
        updatedFeedItems[indexToUpdate] = {
          ...previousFeedItems[indexToUpdate],
          isWatchLater,
        };

        queryClient.setQueryData(
          api.feedItems.getAll.queryKey(),
          updatedFeedItems,
        );

        return { previousFeedItems };
      },
      onError: (_err, _variables, context) => {
        queryClient.setQueryData(["todos"], context?.previousFeedItems);
      },
    }),
  );
}
