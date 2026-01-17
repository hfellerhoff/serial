import { createStore } from "zustand";
import type { ApplicationView } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";
import { createSelectorHooks } from "../createSelectorHooks";
import { sortViewsByPlacement } from "./utils";

export type ViewsStore = {
  reset: () => void;
  views: ApplicationView[];
  viewsDict: Record<number, ApplicationView>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (views: ApplicationView[]) => void;
  add: (view: ApplicationView) => void;
  update: (id: number, view: Partial<ApplicationView>) => void;
  remove: (id: number) => void;
};

const vanillaViewsStore = createStore<ViewsStore>()((set, get) => ({
  reset: () =>
    set({
      views: [],
      viewsDict: {},
      fetchStatus: "idle",
    }),
  views: [],
  viewsDict: {},
  fetchStatus: "idle",

  fetch: async () => {
    if (get().fetchStatus === "fetching") return;

    set({ fetchStatus: "fetching" });

    const data = await orpcRouterClient.view.getAll();

    const dict: Record<number, ApplicationView> = {};
    data.forEach((view) => {
      dict[view.id] = view;
    });

    set({
      views: data,
      viewsDict: dict,
      fetchStatus: "success",
    });
  },

  set: (views) => {
    const sortedViews = sortViewsByPlacement(views);
    const dict: Record<number, ApplicationView> = {};
    sortedViews.forEach((view) => {
      dict[view.id] = view;
    });

    set({
      views: sortedViews,
      viewsDict: dict,
    });
  },

  add: (view) => {
    const newViews = sortViewsByPlacement([...get().views, view]);
    const dict: Record<number, ApplicationView> = {};
    newViews.forEach((v) => {
      dict[v.id] = v;
    });

    set({
      views: newViews,
      viewsDict: dict,
    });
  },

  update: (id, updates) => {
    const existingView = get().viewsDict[id];
    if (!existingView) return;

    const updatedView = { ...existingView, ...updates };
    const newViews = sortViewsByPlacement(
      get().views.map((v) => (v.id === id ? updatedView : v)),
    );

    const dict: Record<number, ApplicationView> = {};
    newViews.forEach((v) => {
      dict[v.id] = v;
    });

    set({
      views: newViews,
      viewsDict: dict,
    });
  },

  remove: (id) => {
    const { [id]: _, ...rest } = get().viewsDict;
    const newViews = get().views.filter((v) => v.id !== id);

    set({
      views: newViews,
      viewsDict: rest,
    });
  },
}));

export const viewsStore = createSelectorHooks(vanillaViewsStore);

export const {
  useViews,
  useViewsDict,
  useFetchStatus: useViewsFetchStatus,
  useFetch: useFetchViews,
  useSet: useSetViews,
  useAdd: useAddView,
  useUpdate: useUpdateView,
  useRemove: useRemoveView,
  useReset: useResetViews,
} = viewsStore;
