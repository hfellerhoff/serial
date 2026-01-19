import { createStore } from "zustand";
import { createSelectorHooks } from "../createSelectorHooks";
import type { ApplicationFeed } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";
import { assembleIteratorResult } from "~/lib/iterators";

export type FeedsStore = {
  reset: () => void;
  feeds: ApplicationFeed[];
  feedsDict: Record<number, ApplicationFeed>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (feeds: ApplicationFeed[]) => void;
  add: (feed: ApplicationFeed) => void;
  update: (id: number, feed: Partial<ApplicationFeed>) => void;
  remove: (id: number) => void;
};

function sortFeedsByUpdatedAt(feeds: ApplicationFeed[]) {
  return [...feeds].sort((a, b) => {
    if (a.updatedAt <= b.updatedAt) return 1;
    return -1;
  });
}

const vanillaFeedsStore = createStore<FeedsStore>()((set, get) => ({
  reset: () =>
    set({
      feeds: [],
      feedsDict: {},
      fetchStatus: "idle",
    }),
  feeds: [],
  feedsDict: {},
  fetchStatus: "idle",

  fetch: async () => {
    if (get().fetchStatus === "fetching") return;

    set({ fetchStatus: "fetching" });

    const chunks: ApplicationFeed[][] = [];
    for await (const chunk of await orpcRouterClient.feed.getAll()) {
      chunks.push(chunk);
    }

    const data = sortFeedsByUpdatedAt(assembleIteratorResult(chunks));

    const dict: Record<number, ApplicationFeed> = {};
    data.forEach((feed) => {
      dict[feed.id] = feed;
    });

    set({
      feeds: data,
      feedsDict: dict,
      fetchStatus: "success",
    });
  },

  set: (feeds) => {
    const sortedFeeds = sortFeedsByUpdatedAt(feeds);
    const dict: Record<number, ApplicationFeed> = {};
    sortedFeeds.forEach((feed) => {
      dict[feed.id] = feed;
    });

    set({
      feeds: sortedFeeds,
      feedsDict: dict,
    });
  },

  add: (feed) => {
    const newFeeds = sortFeedsByUpdatedAt([...get().feeds, feed]);
    const dict: Record<number, ApplicationFeed> = {};
    newFeeds.forEach((f) => {
      dict[f.id] = f;
    });

    set({
      feeds: newFeeds,
      feedsDict: dict,
    });
  },

  update: (id, updates) => {
    const existingFeed = get().feedsDict[id];
    if (!existingFeed) return;

    const updatedFeed = { ...existingFeed, ...updates };
    const newFeeds = sortFeedsByUpdatedAt(
      get().feeds.map((f) => (f.id === id ? updatedFeed : f)),
    );

    const dict: Record<number, ApplicationFeed> = {};
    newFeeds.forEach((f) => {
      dict[f.id] = f;
    });

    set({
      feeds: newFeeds,
      feedsDict: dict,
    });
  },

  remove: (id) => {
    const { [id]: _removed, ...rest } = get().feedsDict;
    void _removed;
    const newFeeds = get().feeds.filter((f) => f.id !== id);

    set({
      feeds: newFeeds,
      feedsDict: rest,
    });
  },
}));

export const feedsStore = createSelectorHooks(vanillaFeedsStore);

export const {
  useFeeds,
  useFeedsDict,
  useFetchStatus: useFeedsFetchStatus,
  useFetch: useFetchFeeds,
  useSet: useSetFeeds,
  useAdd: useAddFeed,
  useUpdate: useUpdateFeed,
  useRemove: useRemoveFeed,
  useReset: useResetFeeds,
} = feedsStore;
