import { createStore, useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { ApplicationFeedItem } from "~/server/db/schema";
import { orpcRouterClient } from "../orpc";
import { createSelectorHooks } from "./createSelectorHooks";

type ApplicationStore = {
  reset: () => void;
  feedItemsOrder: string[];
  setFeedItemsOrder: (itemsOrder: string[]) => void;
  feedItemsDict: Record<string, ApplicationFeedItem>;
  setFeedItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setFeedItem: (id: string, item: ApplicationFeedItem) => void;
  fetchFeedItems: () => Promise<void>;
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
        fetchFeedItemsLastFetchedAt: null,
        fetchFeedItemsStatus: "idle",
      }),
    feedItemsOrder: [],
    setFeedItemsOrder: (itemsOrder) => set({ feedItemsOrder: itemsOrder }),
    feedItemsDict: {},
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

      set({
        fetchFeedItemsStatus: "fetching",
      });

      let lastUpdateTime = 0;
      for await (const incomingFeedItems of await orpcRouterClient.feedItem.getAll()) {
        // const DEBOUNCE_TIME = 50;
        // const timeSinceLastUpdate = Date.now() - lastUpdateTime;
        // const timeToWait = DEBOUNCE_TIME - timeSinceLastUpdate;

        // if (timeToWait > 0) {
        //   await new Promise((res) => setTimeout(res, timeToWait));
        // }

        // console.log("updating");

        // TODO: create date sorting
        const { updatedItemsDict, updatedItemsOrder } =
          incomingFeedItems.reduce(
            ({ updatedItemsDict, updatedItemsOrder }, item) => {
              updatedItemsDict[item.id] = item;

              if (!updatedItemsOrder.find((id) => id === item.id)) {
                updatedItemsOrder.push(item.id);
              }

              return {
                updatedItemsDict,
                updatedItemsOrder,
              };
            },
            {
              updatedItemsDict: { ...get().feedItemsDict },
              updatedItemsOrder: [...get().feedItemsOrder],
            },
          );

        set({
          feedItemsDict: updatedItemsDict,
          feedItemsOrder: updatedItemsOrder,
        });
        lastUpdateTime = Date.now();
      }
      set({
        fetchFeedItemsStatus: "success",
        fetchFeedItemsLastFetchedAt: Date.now(),
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

export const useFeedItemsDict = feedItemsStore.useFeedItemsDict;
export const useFeedItemsOrder = feedItemsStore.useFeedItemsOrder;

export const useFeedItemsLastFetchedAt =
  feedItemsStore.useFetchFeedItemsLastFetchedAt;
export const useFetchFeedItemsStatus = feedItemsStore.useFetchFeedItemsStatus;
export const useFetchFeedItems = feedItemsStore.useFetchFeedItems;

export const useFeedItemValue = (id: string) => {
  return useStore(
    feedItemsStore,
    useShallow((store) => store.feedItemsDict?.[id]),
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
