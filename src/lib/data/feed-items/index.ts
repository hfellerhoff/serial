import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DatabaseFeed,
  type DatabaseFeedCategory,
  type DatabaseFeedItem,
} from "~/server/db/schema";
import { useTRPC } from "~/trpc/react";
import { useEffect, useMemo } from "react";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  categoryFilterAtom,
  dateFilterAtom,
  feedCategoriesAtom,
  feedFilterAtom,
  feedItemsMapAtom,
  feedItemsOrderAtom,
  feedsAtom,
  hasFetchedFeedItemsAtom,
  viewFilterAtom,
  type VisibilityFilter,
  visibilityFilterAtom,
} from "../atoms";
import { splitAtom } from "jotai/utils";
import { ApplicationView } from "../views";

export function doesFeedItemPassFilters(
  item: DatabaseFeedItem,
  dateFilter: number,
  visibilityFilter: VisibilityFilter,
  categoryFilter: number,
  feedCategories: DatabaseFeedCategory[],
  feedFilter: number,
  feeds: DatabaseFeed[],
  viewFilter: ApplicationView | null,
) {
  const date = new Date(item.postedAt);
  const now = new Date();
  const sevenDaysAgo = new Date(
    now.setDate(now.getDate() - (Number.isNaN(dateFilter) ? 1 : dateFilter)),
  );

  // Date filter
  if (date <= sevenDaysAgo) {
    return false;
  }

  // Visibility filter
  if (visibilityFilter === "unread" && (item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "later" && !item.isWatchLater) {
    return false;
  }

  if (visibilityFilter === "shorts" && item.orientation !== "vertical") {
    return false;
  }
  if (visibilityFilter !== "shorts" && item.orientation === "vertical") {
    return false;
  }

  // Category filter
  const feedIdsInCategory = feedCategories
    .filter((category) => category.categoryId === categoryFilter)
    .map((category) => category.feedId);
  if (categoryFilter >= 0 && !feedIdsInCategory.includes(item.feedId)) {
    return false;
  }

  // Feed filter
  if (feedFilter >= 0 && item.feedId !== feedFilter) {
    return false;
  }

  const feedsForView = feedCategories
    .filter(
      (category) =>
        category.categoryId !== null &&
        viewFilter?.categoryIds.includes(category.categoryId),
    )
    .map((category) => category.feedId);

  // View filter
  if (
    !!viewFilter &&
    viewFilter.categoryIds.length > 0 &&
    !feedsForView.includes(item.feedId)
  ) {
    return false;
  }

  return true;
}

const filteredFeedItemsOrderAtom = atom((get) => {
  const dateFilter = get(dateFilterAtom);
  const visibilityFilter = get(visibilityFilterAtom);
  const categoryFilter = get(categoryFilterAtom);
  const feedItemsOrder = get(feedItemsOrderAtom);
  const feedItemsMap = get(feedItemsMapAtom);
  const feedCategories = get(feedCategoriesAtom);
  const feedFilter = get(feedFilterAtom);
  const feeds = get(feedsAtom);
  const viewFilter = get(viewFilterAtom);

  return feedItemsOrder.filter(
    (item) =>
      feedItemsMap[item] &&
      doesFeedItemPassFilters(
        feedItemsMap[item],
        dateFilter,
        visibilityFilter,
        categoryFilter,
        feedCategories,
        feedFilter,
        feeds,
        viewFilter,
      ),
  );
});
export const useFilteredFeedItemsOrder = () =>
  useAtomValue(filteredFeedItemsOrderAtom);

export function useFeedItemsQuery() {
  const setHasFetchedFeedItems = useSetAtom(hasFetchedFeedItemsAtom);
  const setFeedItemsOrder = useSetAtom(feedItemsOrderAtom);
  const setFeedItemsMap = useSetAtom(feedItemsMapAtom);

  const query = useQuery(
    useTRPC().feedItems.getAll.queryOptions(undefined, {
      staleTime: Infinity,
    }),
  );

  useEffect(() => {
    if (query.isSuccess) {
      setHasFetchedFeedItems(true);
      setFeedItemsOrder(query.data.map((item) => item.contentId));
      setFeedItemsMap(
        query.data.reduce(
          (acc, item) => ({ ...acc, [item.contentId]: item }),
          {},
        ),
      );
    }
  }, [query, setFeedItemsOrder]);

  return query;
}

export const FETCH_NEW_FEED_ITEMS_KEY = "fetch-items-on-mount";
