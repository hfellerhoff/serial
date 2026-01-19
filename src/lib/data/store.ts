import { createStore, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { orpcRouterClient } from "../orpc";
import { sortFeedItemsOrderByDate } from "../sortFeedItems";
import { createSelectorHooks } from "./createSelectorHooks";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { FetchFeedsStatus } from "~/server/rss/fetchFeeds";

export type ApplicationStore = {
  reset: () => void;
  feedItemsOrder: string[];
  setFeedItemsOrder: (itemsOrder: string[]) => void;
  feedItemsDict: Record<string, ApplicationFeedItem>;
  feedStatusDict: Record<number, FetchFeedsStatus>;
  setFeedItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setFeedItem: (id: string, item: ApplicationFeedItem) => void;
  fetchFeedItems: () => Promise<void>;
  fetchFeedItemsForFeed: (feedId: number) => Promise<void>;
  fetchFeedItemsLastFetchedAt: number | null;
  fetchFeedItemsStatus: "idle" | "fetching" | "success";
};

const vanillaApplicationStore = createStore<ApplicationStore>()(
  // persist(
  (set, get) => ({
    reset: () =>
      set({
        feedItemsOrder: [],
        feedItemsDict: {},
        feedStatusDict: {},
        fetchFeedItemsLastFetchedAt: null,
        fetchFeedItemsStatus: "idle",
      }),
    feedItemsOrder: [],
    setFeedItemsOrder: (itemsOrder) => set({ feedItemsOrder: itemsOrder }),
    feedItemsDict: {},
    feedStatusDict: {},
    setFeedItemsDict: (itemsDict) => set({ feedItemsDict: itemsDict }),
    setFeedItem: (id, item) =>
      set({
        feedItemsDict: {
          ...get().feedItemsDict,
          [id]: item,
        },
      }),
    fetchFeedItemsLastFetchedAt: null,
    fetchFeedItemsStatus: "idle",

    fetchFeedItems: async () => {
      if (get().fetchFeedItemsStatus === "fetching") return;

      console.log("FETCHING");

      set({
        fetchFeedItemsStatus: "fetching",
        feedStatusDict: {},
      });

      let lastUpdateTime = 0;
      const DEBOUNCE_TIME = 1000;

      for await (const incomingChunk of await orpcRouterClient.feedItem.getAll()) {
        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        const timeToWait = DEBOUNCE_TIME - timeSinceLastUpdate;
        const shouldWaitToRender = timeToWait > 0;

        const feedStatusDict = shouldWaitToRender
          ? get().feedStatusDict
          : {
              ...get().feedStatusDict,
            };

        const feedItemsDict = shouldWaitToRender
          ? get().feedItemsDict
          : {
              ...get().feedItemsDict,
            };

        const feedItemsOrder = shouldWaitToRender
          ? get().feedItemsOrder
          : [...get().feedItemsOrder];

        if (incomingChunk.type === "feed-status") {
          feedStatusDict[incomingChunk.feedId] = incomingChunk.status;
        } else {
          const incomingFeedItems = incomingChunk.feedItems;

          incomingFeedItems.forEach((item) => {
            feedItemsDict[item.id] = item;

            if (!feedItemsOrder.find((id) => id === item.id)) {
              feedItemsOrder.push(item.id);
            }
          });
        }

        set({
          feedItemsDict: feedItemsDict,
          feedItemsOrder: feedItemsOrder.sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
          feedStatusDict: feedStatusDict,
        });

        if (!shouldWaitToRender) {
          lastUpdateTime = Date.now();
        }
      }

      set({
        fetchFeedItemsStatus: "success",
        fetchFeedItemsLastFetchedAt: Date.now(),
        feedItemsDict: { ...get().feedItemsDict },
        feedItemsOrder: [...get().feedItemsOrder].sort(
          sortFeedItemsOrderByDate(get().feedItemsDict),
        ),
        feedStatusDict: { ...get().feedStatusDict },
      });
    },

    fetchFeedItemsForFeed: async (feedId: number) => {
      set({
        fetchFeedItemsStatus: "fetching",
      });

      for await (const incomingChunk of await orpcRouterClient.feedItem.getByFeedId(
        { feedId },
      )) {
        const feedStatusDict = { ...get().feedStatusDict };
        const feedItemsDict = { ...get().feedItemsDict };
        const feedItemsOrder = [...get().feedItemsOrder];

        if (incomingChunk.type === "feed-status") {
          feedStatusDict[incomingChunk.feedId] = incomingChunk.status;
        } else {
          const incomingFeedItems = incomingChunk.feedItems;

          incomingFeedItems.forEach((item) => {
            feedItemsDict[item.id] = item;

            if (!feedItemsOrder.find((id) => id === item.id)) {
              feedItemsOrder.push(item.id);
            }
          });
        }

        set({
          feedItemsDict: feedItemsDict,
          feedItemsOrder: feedItemsOrder.sort(
            sortFeedItemsOrderByDate(get().feedItemsDict),
          ),
          feedStatusDict: feedStatusDict,
        });
      }

      set({
        fetchFeedItemsStatus: "success",
        feedItemsOrder: [...get().feedItemsOrder].sort(
          sortFeedItemsOrderByDate(get().feedItemsDict),
        ),
      });
    },
  }),
  //   {
  //     name: "serial", // name of the item in the storage (must be unique)
  //     version: 0,
  //     partialize: (state) => ({
  //       itemsOrder: state.feedItemsOrder,
  //       itemsDict: state.feedItemsDict,
  //       fetchItemsLastFetchedAt: state.fetchFeedItemsLastFetchedAt,
  //     }),
  //   },
  // ),
);

export const feedItemsStore = createSelectorHooks(vanillaApplicationStore);

export const {
  useFeedItemsDict,
  useFeedItemsOrder,
  useFeedStatusDict,
  useFetchFeedItemsLastFetchedAt,
  useFetchFeedItemsStatus,
  useFetchFeedItems,
  useFetchFeedItemsForFeed,
  useReset: useResetFeedItems,
} = feedItemsStore;

export const useFeedItemValue = (id: string) => {
  return useStore(
    feedItemsStore,
    useShallow((store) => store.feedItemsDict[id]),
  );
};
export const useSetFeedItemValue = (id: string) => {
  const setter = useStore(feedItemsStore, (store) => store.setFeedItem);

  return (item: ApplicationFeedItem) => setter(id, item);
};

export const useFeedItemState = (id: string) => {
  const value = useFeedItemValue(id);
  const setValue = useSetFeedItemValue(id);

  return [value, setValue] as const;
};
