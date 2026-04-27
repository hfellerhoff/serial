import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createSelectorHooks } from "../createSelectorHooks";
import { createIDBStorage } from "../idb-storage";
import type { DatabaseContentCategory } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";

export type ContentCategoriesStore = {
  reset: () => void;
  contentCategories: DatabaseContentCategory[];
  contentCategoriesDict: Record<number, DatabaseContentCategory>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (categories: DatabaseContentCategory[]) => void;
  add: (category: DatabaseContentCategory) => void;
  update: (id: number, category: Partial<DatabaseContentCategory>) => void;
  remove: (id: number) => void;
};

const vanillaContentCategoriesStore = createStore<ContentCategoriesStore>()(
  persist(
    (set, get) => ({
      reset: () =>
        set({
          contentCategories: [],
          contentCategoriesDict: {},
          fetchStatus: "idle",
        }),
      contentCategories: [],
      contentCategoriesDict: {},
      fetchStatus: "idle",

      fetch: async () => {
        if (get().fetchStatus === "fetching") return;

        set({ fetchStatus: "fetching" });

        const data = await orpcRouterClient.contentCategories.getAll();

        const dict: Record<number, DatabaseContentCategory> = {};
        data.forEach((category) => {
          dict[category.id] = category;
        });

        set({
          contentCategories: data,
          contentCategoriesDict: dict,
          fetchStatus: "success",
        });
      },

      set: (categories) => {
        const dict: Record<number, DatabaseContentCategory> = {};
        categories.forEach((category) => {
          dict[category.id] = category;
        });

        set({
          contentCategories: categories,
          contentCategoriesDict: dict,
        });
      },

      add: (category) => {
        set({
          contentCategories: [...get().contentCategories, category],
          contentCategoriesDict: {
            ...get().contentCategoriesDict,
            [category.id]: category,
          },
        });
      },

      update: (id, updates) => {
        const existingCategory = get().contentCategoriesDict[id];
        if (!existingCategory) return;

        const updatedCategory = { ...existingCategory, ...updates };

        set({
          contentCategories: get().contentCategories.map((c) =>
            c.id === id ? updatedCategory : c,
          ),
          contentCategoriesDict: {
            ...get().contentCategoriesDict,
            [id]: updatedCategory,
          },
        });
      },

      remove: (id) => {
        const { [id]: _removed, ...rest } = get().contentCategoriesDict;
        void _removed;

        set({
          contentCategories: get().contentCategories.filter((c) => c.id !== id),
          contentCategoriesDict: rest,
        });
      },
    }),
    {
      name: "serial-content-categories-store",
      storage: createIDBStorage(),
      version: 1,
      partialize: (state) => ({
        contentCategories: state.contentCategories,
        contentCategoriesDict: state.contentCategoriesDict,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<ContentCategoriesStore>),
        };
        if (merged.contentCategories.length > 0) {
          merged.fetchStatus = "success";
        }
        return merged;
      },
    },
  ),
);

export const contentCategoriesStore = createSelectorHooks(
  vanillaContentCategoriesStore,
);

export const {
  useContentCategories,
  useFetchStatus: useContentCategoriesFetchStatus,
  useFetch: useFetchContentCategories,
  useReset: useResetContentCategories,
} = contentCategoriesStore;
