"use client";
import {
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";
import { useTRPC } from "~/trpc/react";
import { useSearchParamState } from "../hooks/use-search-param-state";
import { z } from "zod";
import { getItemsAndFeeds } from "./getItemsAndFeeds";

import { useMutation } from "@tanstack/react-query";
import type { FeedRouter } from "~/server/api/routers/feed";

export type VisibilityFilter = "all" | "unread" | "later";

type FeedData = FeedRouter["getAllFeedData"];
type Item = FeedData["items"][number];

type FeedContext = {
  feeds: FeedData["feeds"];
  allItems: FeedData["items"];
  items: FeedData["items"];
  dateFilter: string;
  setDateFilter: Dispatch<SetStateAction<string>>;
  visibilityFilter: VisibilityFilter;
  setVisibilityFilter: Dispatch<SetStateAction<VisibilityFilter>>;
  findPreviousVideoId: (videoID: string) => string | null;
  findNextVideoId: (videoID: string) => string | null;
  toggleWatchLater: (videoID: string) => Promise<void>;
  toggleIsWatched: (videoID: string) => Promise<void>;
  addFeed: (data: { url: string; categoryId?: number }) => Promise<void>;
  deleteFeed: (id: number) => Promise<void>;
};

const FeedContext = createContext<FeedContext | null>(null);

function doesItemMatchFilters(
  item: Item,
  dateFilter: string,
  visibilityFilter: VisibilityFilter,
) {
  const date = new Date(item.postedAt);
  const now = new Date();
  const parsedDateFilter = parseInt(dateFilter, 10);
  const sevenDaysAgo = new Date(
    now.setDate(
      now.getDate() - (Number.isNaN(parsedDateFilter) ? 1 : parsedDateFilter),
    ),
  );
  if (date <= sevenDaysAgo) return false;

  if (visibilityFilter === "unread" && (item.isWatched || item.isWatchLater)) {
    return false;
  }
  if (visibilityFilter === "later" && !item.isWatchLater) {
    return false;
  }

  return true;
}

export const FeedProvider = ({
  children,
  data,
}: PropsWithChildren<{
  data: FeedData;
}>) => {
  const trpc = useTRPC();
  const [feeds, setFeeds] = useState(data.feeds);
  const [items, setItems] = useState(data.items);

  const { mutateAsync: setIsItemWatchLater } = useMutation(
    trpc.feed.setFeedItemWatchLater.mutationOptions(),
  );
  const { mutateAsync: setIsItemWatched } = useMutation(
    trpc.feed.setFeedItemWatched.mutationOptions(),
  );
  const { mutateAsync: addFeedMutation } = useMutation(
    trpc.feed.create.mutationOptions(),
  );
  const { mutateAsync: deleteFeedMutation } = useMutation(
    trpc.feed.delete.mutationOptions(),
  );

  const [dateFilter, setDateFilter] = useSearchParamState(
    "days",
    "1",
    z.string(),
  );
  const [visibilityFilter, setVisibilityFilter] = useSearchParamState(
    "visibility",
    "unread",
    z.enum(["all", "unread", "later"]),
  );

  const processedItems = useMemo(() => {
    return items.filter((item) =>
      doesItemMatchFilters(item, dateFilter, visibilityFilter),
    );
  }, [items, dateFilter, visibilityFilter]);

  const toggleWatchLater = useCallback(
    async (videoID: string) => {
      const item = items.find((item) => item.contentId === videoID);
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!item || item.feedId === null) return;

      const isWatchLater = !item.isWatchLater;

      setItems((prevItems) => {
        return prevItems.map((prevItem) => {
          if (prevItem.contentId === item.contentId) {
            return { ...prevItem, isWatchLater };
          }
          return prevItem;
        });
      });

      await setIsItemWatchLater({
        feedId: item.feedId,
        contentId: item.contentId,
        isWatchLater,
      });
    },
    [items, setIsItemWatchLater],
  );

  const toggleIsWatched = useCallback(
    async (videoID: string) => {
      const item = items.find((item) => item.contentId === videoID);
      // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
      if (!item || item.feedId === null) return;

      const isWatched = !item.isWatched;

      setItems((prevItems) => {
        return prevItems.map((prevItem) => {
          if (prevItem.contentId === item.contentId) {
            return { ...prevItem, isWatched };
          }
          return prevItem;
        });
      });

      await setIsItemWatched({
        feedId: item.feedId,
        contentId: item.contentId,
        isWatched,
      });
    },
    [items, setIsItemWatched],
  );

  const findPreviousVideoId = useCallback(
    (videoID: string) => {
      const currentIndex = items.findIndex(
        (item) => item.contentId === videoID,
      );
      if (currentIndex <= 0) return null;

      let index = currentIndex - 1;
      let video = items[index]!;
      while (!doesItemMatchFilters(video, dateFilter, visibilityFilter)) {
        index = index - 1;
        if (index < 0) return null;
        video = items[index]!;
      }

      return video.contentId;
    },
    [dateFilter, items, visibilityFilter],
  );

  const findNextVideoId = useCallback(
    (videoID: string) => {
      const currentIndex = items.findIndex(
        (item) => item.contentId === videoID,
      );
      if (currentIndex === -1 || currentIndex === items.length - 1) return null;

      let index = currentIndex + 1;
      let video = items[index]!;
      while (!doesItemMatchFilters(video, dateFilter, visibilityFilter)) {
        index = index + 1;
        if (index >= items.length - 1) return null;
        video = items[index]!;
      }

      return video.contentId;
    },
    [dateFilter, items, visibilityFilter],
  );

  const addFeed = useCallback<FeedContext["addFeed"]>(
    async ({ url, categoryId }) => {
      await addFeedMutation({ url, categoryId });
      const res = await getItemsAndFeeds();
      setItems(res.items);
      setFeeds(res.feeds);
    },
    [addFeedMutation],
  );

  const deleteFeed = useCallback<FeedContext["deleteFeed"]>(
    async (id) => {
      setFeeds((prevFeeds) => prevFeeds.filter((feed) => feed.id !== id));
      await deleteFeedMutation(id);

      const res = await getItemsAndFeeds();
      setItems(res.items);
      setFeeds(res.feeds);
    },
    [deleteFeedMutation],
  );

  return (
    <FeedContext.Provider
      value={{
        feeds,
        items: processedItems,
        allItems: items,
        dateFilter,
        setDateFilter,
        visibilityFilter,
        setVisibilityFilter,
        findPreviousVideoId,
        findNextVideoId,
        toggleWatchLater,
        toggleIsWatched,
        addFeed,
        deleteFeed,
      }}
    >
      {children}
    </FeedContext.Provider>
  );
};

export const useFeed = () => {
  const context = useContext(FeedContext);

  if (context === null) {
    throw new Error("useFeed must be used within a FeedProvider");
  }

  return context;
};
