import { create } from "zustand";
import { ApplicationFeedItem } from "~/server/db/schema";
import { orpcRouterClient } from "../orpc";

type FeedItemsStore = {
  reset: () => void;
  itemsOrder: string[];
  setItemsOrder: (itemsOrder: string[]) => void;
  itemsDict: Record<string, ApplicationFeedItem>;
  setItemsDict: (itemsDict: Record<string, ApplicationFeedItem>) => void;
  setItem: (id: string, item: ApplicationFeedItem) => void;
  fetchItemsAction: {
    fetch: () => Promise<void>;
    lastFetchedAt: number | null;
    status: "idle" | "fetching" | "success";
  };
};

function sortFeedItem(a: ApplicationFeedItem, b: ApplicationFeedItem) {
  if (a.postedAt <= b.postedAt) return 1;
  return -1;
}

export const useFeedItemsStore = create<FeedItemsStore>(
  // )(persist(
  (set, get) => ({
    reset: () =>
      set({
        itemsOrder: [],
        itemsDict: {},
        fetchItemsAction: {
          ...get().fetchItemsAction,
          lastFetchedAt: null,
          status: "idle",
        },
      }),
    itemsOrder: [],
    setItemsOrder: (itemsOrder) => set({ itemsOrder }),
    itemsDict: {},
    setItemsDict: (itemsDict) => set({ itemsDict }),
    setItem: (id, item) =>
      set({
        itemsDict: {
          ...get().itemsDict,
          [id]: item,
        },
      }),
    fetchItemsAction: {
      lastFetchedAt: null,
      status: "idle",
      fetch: async () => {
        if (get().fetchItemsAction.status === "fetching") return;

        set((prevStore) => {
          return {
            fetchItemsAction: {
              ...prevStore.fetchItemsAction,
              status: "fetching",
            },
          };
        });
        for await (const incomingFeedItems of await orpcRouterClient.feedItem.getAll()) {
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
                updatedItemsDict: get().itemsDict,
                updatedItemsOrder: get().itemsOrder,
              },
            );

          set({
            itemsDict: updatedItemsDict,
            itemsOrder: updatedItemsOrder,
          });
        }
        set((prevStore) => {
          return {
            fetchItemsAction: {
              ...prevStore.fetchItemsAction,
              status: "success",
              lastFetchedAt: Date.now(),
            },
          };
        });
      },
    },
  }),
  //     {
  //       name: "serial-feed-items-store", // name of the item in the storage (must be unique)
  //     },
  //   ),
);

export const useFeedItemsOrder = () =>
  useFeedItemsStore((store) => store.itemsOrder);
export const useFeedItemsDict = () =>
  useFeedItemsStore((store) => store.itemsDict);

export const useFeedItemsLastFetchedAt = () =>
  useFeedItemsStore((store) => store.fetchItemsAction.lastFetchedAt);
export const useFetchFeedItemsStatus = () =>
  useFeedItemsStore((store) => store.fetchItemsAction.status);
export const useFetchFeedItems = () =>
  useFeedItemsStore((store) => store.fetchItemsAction.fetch);

export const useFeedItemValue = (id: string) =>
  useFeedItemsStore((store) => store.itemsDict?.[id]);
export const useSetFeedItemValue = (id: string) =>
  useFeedItemsStore(
    (store) => (item: ApplicationFeedItem) => store.setItem(id, item),
  );

export const useFeedItemState = (id: string) => {
  const value = useFeedItemValue(id);
  const setValue = useSetFeedItemValue(id);

  return [value, setValue] as const;
};
