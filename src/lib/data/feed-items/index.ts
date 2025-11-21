import { useQuery } from "@tanstack/react-query";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import { assembleIteratorResult } from "~/lib/iterators";
import { orpc } from "~/lib/orpc";
import type {
  ApplicationFeedItem,
  ApplicationView,
  DatabaseFeed,
  DatabaseFeedCategory,
} from "~/server/db/schema";
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
import { INBOX_VIEW_ID } from "../views";

export function doesFeedItemPassFilters(
  item: ApplicationFeedItem,
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
  const doesFeedHaveAnyCategories = feedCategories.some(
    (category) => category.feedId === item.feedId,
  );
  if (viewFilter?.id === INBOX_VIEW_ID && !doesFeedHaveAnyCategories) {
    return true;
  }

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

export function useDoesFeedItemMatchAllFilters(item: ApplicationFeedItem) {
  const dateFilter = useAtomValue(dateFilterAtom);
  const visibilityFilter = useAtomValue(visibilityFilterAtom);
  const categoryFilter = useAtomValue(categoryFilterAtom);
  const feedCategories = useAtomValue(feedCategoriesAtom);
  const feedFilter = useAtomValue(feedFilterAtom);
  const feeds = useAtomValue(feedsAtom);
  const viewFilter = useAtomValue(viewFilterAtom);

  return doesFeedItemPassFilters(
    item,
    dateFilter,
    visibilityFilter,
    categoryFilter,
    feedCategories,
    feedFilter,
    feeds,
    viewFilter,
  );
}
export const useFilteredFeedItemsOrder = () =>
  useAtomValue(filteredFeedItemsOrderAtom);

const ONE_HOUR = 1000 * 60 * 60;

export function useFeedItemsQuery() {
  const setHasFetchedFeedItems = useSetAtom(hasFetchedFeedItemsAtom);
  const setFeedItemsOrder = useSetAtom(feedItemsOrderAtom);
  const setFeedItemsMap = useSetAtom(feedItemsMapAtom);

  const hasUpdatedBasedOnQueryRef = useRef(false);
  const query = useQuery(
    orpc.feedItem.getAll.experimental_streamedOptions({
      staleTime: ONE_HOUR,
    }),
  );

  useEffect(() => {
    if (query.fetchStatus === "fetching") {
      const data = assembleIteratorResult(query.data ?? []).sort((a, b) => {
        if (a.postedAt <= b.postedAt) return 1;
        return -1;
      });

      setFeedItemsOrder((prevItemsOrder) =>
        data.reduce((acc, item) => {
          if (acc.find((id) => id === item.id)) {
            return acc;
          }
          acc.push(item.id);
          return acc;
        }, prevItemsOrder),
      );
      setFeedItemsMap((prevItemsMap) =>
        data.reduce((acc, item) => ({ ...acc, [item.id]: item }), prevItemsMap),
      );
    } else if (
      query.isSuccess &&
      query.fetchStatus === "idle" &&
      hasUpdatedBasedOnQueryRef.current === false
    ) {
      const data = assembleIteratorResult(query.data).sort((a, b) => {
        if (a.postedAt <= b.postedAt) return 1;
        return -1;
      });

      hasUpdatedBasedOnQueryRef.current = true;
      setHasFetchedFeedItems(true);
      setFeedItemsOrder(data.map((item) => item.id));
      setFeedItemsMap(
        data.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
      );
    } else if (query.isFetching) {
      hasUpdatedBasedOnQueryRef.current = false;
    }
  }, [
    query.isSuccess,
    query.isFetching,
    query.fetchStatus,
    query.data,
    setFeedItemsOrder,
    setFeedItemsMap,
    setHasFetchedFeedItems,
  ]);

  return query;
}

export const FETCH_NEW_FEED_ITEMS_KEY = "fetch-items-on-mount";
