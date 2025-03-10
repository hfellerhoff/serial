// "use client";
// import {
//   type Dispatch,
//   type PropsWithChildren,
//   type SetStateAction,
//   createContext,
//   useContext,
//   useMemo,
//   useState,
//   useCallback,
// } from "react";
// import { useTRPC } from "~/trpc/react";
// import { useSearchParamState } from "../hooks/use-search-param-state";
// import { z } from "zod";

// import { useMutation } from "@tanstack/react-query";
// import type { FeedRouter } from "~/server/api/routers/feedRouter";

// export type VisibilityFilter = "all" | "unread" | "later";

// type FeedData = FeedRouter["getAllFeedData"];
// type Item = FeedData["items"][number];

// type FeedContext = {
//   feeds: FeedData["feeds"];
//   allItems: FeedData["items"];
//   items: FeedData["items"];
//   dateFilter: string;
//   setDateFilter: Dispatch<SetStateAction<string>>;
//   visibilityFilter: VisibilityFilter;
//   setVisibilityFilter: Dispatch<SetStateAction<VisibilityFilter>>;
//   categoryFilter: string;
//   setCategoryFilter: Dispatch<SetStateAction<string>>;
//   findPreviousVideoId: (videoID: string) => string | null;
//   findNextVideoId: (videoID: string) => string | null;
//   toggleWatchLater: (videoID: string) => Promise<void>;
//   toggleIsWatched: (videoID: string) => Promise<void>;
//   addFeed: (data: { url: string; categoryId?: number }) => Promise<void>;
//   deleteFeed: (id: number) => Promise<void>;
// };

// const FeedContext = createContext<FeedContext | null>(null);

// function doesItemMatchFilters(
//   item: Item,
//   dateFilter: string,
//   visibilityFilter: VisibilityFilter,
//   categoryFilter: string,
// ) {
//   const date = new Date(item.feed_item.postedAt);
//   const now = new Date();
//   const parsedDateFilter = parseInt(dateFilter, 10);
//   const sevenDaysAgo = new Date(
//     now.setDate(
//       now.getDate() - (Number.isNaN(parsedDateFilter) ? 1 : parsedDateFilter),
//     ),
//   );

//   // Date filter
//   if (date <= sevenDaysAgo) return false;

//   // Visibility filter
//   if (
//     visibilityFilter === "unread" &&
//     (item.feed_item.isWatched || item.feed_item.isWatchLater)
//   ) {
//     return false;
//   }
//   if (visibilityFilter === "later" && !item.feed_item.isWatchLater) {
//     return false;
//   }

//   // Category filter
//   if (!!categoryFilter && item.content_categories?.name !== categoryFilter) {
//     return false;
//   }

//   return true;
// }

// export const FeedProvider = ({
//   children,
//   data,
// }: PropsWithChildren<{
//   data: FeedData;
// }>) => {
//   const trpc = useTRPC();
//   const [feeds, setFeeds] = useState(data.feeds);
//   const [items, setItems] = useState(data.items);

//   const { mutateAsync: addFeedMutation } = useMutation(
//     trpc.feeds.create.mutationOptions(),
//   );
//   const { mutateAsync: deleteFeedMutation } = useMutation(
//     trpc.feeds.delete.mutationOptions(),
//   );

//   const [dateFilter, setDateFilter] = useSearchParamState(
//     "days",
//     "1",
//     z.string(),
//   );
//   const [visibilityFilter, setVisibilityFilter] = useSearchParamState(
//     "visibility",
//     "unread",
//     z.enum(["all", "unread", "later"]),
//   );
//   const [categoryFilter, setCategoryFilter] = useSearchParamState(
//     "category",
//     "",
//     z.string(),
//   );

//   const processedItems = useMemo(() => {
//     return items.filter((item) =>
//       doesItemMatchFilters(item, dateFilter, visibilityFilter, categoryFilter),
//     );
//   }, [items, dateFilter, visibilityFilter, categoryFilter]);

//   const findPreviousVideoId = useCallback(
//     (videoID: string) => {
//       const currentIndex = items.findIndex(
//         (item) => item.feed_item.contentId === videoID,
//       );
//       if (currentIndex <= 0) return null;

//       let index = currentIndex - 1;
//       let video = items[index]!;
//       while (
//         !doesItemMatchFilters(
//           video,
//           dateFilter,
//           visibilityFilter,
//           categoryFilter,
//         )
//       ) {
//         index = index - 1;
//         if (index < 0) return null;
//         video = items[index]!;
//       }

//       return video.feed_item.contentId;
//     },
//     [dateFilter, items, visibilityFilter],
//   );

//   const findNextVideoId = useCallback(
//     (videoID: string) => {
//       const currentIndex = items.findIndex(
//         (item) => item.feed_item.contentId === videoID,
//       );
//       if (currentIndex === -1 || currentIndex === items.length - 1) return null;

//       let index = currentIndex + 1;
//       let video = items[index]!;
//       while (
//         !doesItemMatchFilters(
//           video,
//           dateFilter,
//           visibilityFilter,
//           categoryFilter,
//         )
//       ) {
//         index = index + 1;
//         if (index >= items.length - 1) return null;
//         video = items[index]!;
//       }

//       return video.feed_item.contentId;
//     },
//     [dateFilter, items, visibilityFilter],
//   );

//   return (
//     <FeedContext.Provider
//       value={{
//         feeds,
//         items: processedItems,
//         allItems: items,
//         dateFilter,
//         setDateFilter,
//         visibilityFilter,
//         setVisibilityFilter,
//         categoryFilter,
//         setCategoryFilter,
//         findPreviousVideoId,
//         findNextVideoId,
//       }}
//     >
//       {children}
//     </FeedContext.Provider>
//   );
// };

// export const useFeed = () => {
//   const context = useContext(FeedContext);

//   if (context === null) {
//     throw new Error("useFeed must be used within a FeedProvider");
//   }

//   return context;
// };
