import { createStore } from "zustand";
import { createSelectorHooks } from "../createSelectorHooks";
import type { DatabaseFeedCategory } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";

export type FeedCategoriesStore = {
  reset: () => void;
  feedCategories: DatabaseFeedCategory[];
  feedCategoriesDict: Record<string, DatabaseFeedCategory>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (categories: DatabaseFeedCategory[]) => void;
  add: (category: DatabaseFeedCategory) => void;
  remove: (feedId: number, categoryId: number) => void;
};

function getFeedCategoryKey(feedId: number, categoryId: number) {
  return `${feedId}-${categoryId}`;
}

const vanillaFeedCategoriesStore = createStore<FeedCategoriesStore>()(
  (set, get) => ({
    reset: () =>
      set({
        feedCategories: [],
        feedCategoriesDict: {},
        fetchStatus: "idle",
      }),
    feedCategories: [],
    feedCategoriesDict: {},
    fetchStatus: "idle",

    fetch: async () => {
      if (get().fetchStatus === "fetching") return;

      set({ fetchStatus: "fetching" });

      const data = await orpcRouterClient.feedCategories.getAll();

      const dict: Record<string, DatabaseFeedCategory> = {};
      data.forEach((category) => {
        const key = getFeedCategoryKey(category.feedId, category.categoryId);
        dict[key] = category;
      });

      set({
        feedCategories: data,
        feedCategoriesDict: dict,
        fetchStatus: "success",
      });
    },

    set: (categories) => {
      const dict: Record<string, DatabaseFeedCategory> = {};
      categories.forEach((category) => {
        const key = getFeedCategoryKey(category.feedId, category.categoryId);
        dict[key] = category;
      });

      set({
        feedCategories: categories,
        feedCategoriesDict: dict,
      });
    },

    add: (category) => {
      const key = getFeedCategoryKey(category.feedId, category.categoryId);

      set({
        feedCategories: [...get().feedCategories, category],
        feedCategoriesDict: {
          ...get().feedCategoriesDict,
          [key]: category,
        },
      });
    },

    remove: (feedId, categoryId) => {
      const key = getFeedCategoryKey(feedId, categoryId);
      const { [key]: _removed, ...rest } = get().feedCategoriesDict;
      void _removed;

      set({
        feedCategories: get().feedCategories.filter(
          (c) => !(c.feedId === feedId && c.categoryId === categoryId),
        ),
        feedCategoriesDict: rest,
      });
    },
  }),
);

export const feedCategoriesStore = createSelectorHooks(
  vanillaFeedCategoriesStore,
);

export const {
  useFeedCategories,
  useFeedCategoriesDict,
  useFetchStatus: useFeedCategoriesFetchStatus,
  useFetch: useFetchFeedCategories,
  useSet: useSetFeedCategories,
  useAdd: useAddFeedCategory,
  useRemove: useRemoveFeedCategory,
  useReset: useResetFeedCategories,
} = feedCategoriesStore;
