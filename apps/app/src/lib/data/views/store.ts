import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createSelectorHooks } from "../createSelectorHooks";
import { createIDBStorage } from "../idb-storage";
import { sortViewsByPlacement } from "./utils";
import type { ApplicationView } from "~/server/db/schema";
import type { NavigationAvailability } from "~/server/navigation/snapshot";
import { orpcRouterClient } from "~/lib/orpc";

export type ViewsStore = {
  reset: () => void;
  views: ApplicationView[];
  viewsDict: Record<number, ApplicationView>;
  viewAvailability: Record<number, NavigationAvailability>;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (views: ApplicationView[]) => void;
  add: (view: ApplicationView) => void;
  update: (id: number, view: Partial<ApplicationView>) => void;
  remove: (id: number) => void;
  removeFeedReferences: (feedIds: number[]) => void;
  setViewAvailability: (
    availability: Record<number, NavigationAvailability>,
  ) => void;
};

export type PersistedViewsState = Pick<
  ViewsStore,
  "views" | "viewsDict" | "viewAvailability"
>;

export function removeFeedReferencesFromViews(
  views: ApplicationView[],
  feedIds: ReadonlySet<number>,
): ApplicationView[] {
  return views.map((view) => ({
    ...view,
    feedIds: view.feedIds.filter((feedId) => !feedIds.has(feedId)),
    viewSections: view.viewSections.filter(
      (section) => section.itemType !== "feed" || !feedIds.has(section.itemId),
    ),
  }));
}

export const viewsStoreApi = createStore<ViewsStore>()(
  persist<ViewsStore, [], [], PersistedViewsState>(
    (set, get) => ({
      reset: () =>
        set({
          views: [],
          viewsDict: {},
          viewAvailability: {},
          fetchStatus: "idle",
        }),
      views: [],
      viewsDict: {},
      viewAvailability: {},
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
        const { [id]: _removed, ...rest } = get().viewsDict;
        void _removed;
        const newViews = get().views.filter((v) => v.id !== id);

        set({
          views: newViews,
          viewsDict: rest,
        });
      },

      removeFeedReferences: (feedIds) => {
        const updatedViews = removeFeedReferencesFromViews(
          get().views,
          new Set(feedIds),
        );
        const viewsDict: Record<number, ApplicationView> = {};
        updatedViews.forEach((view) => {
          viewsDict[view.id] = view;
        });

        set({ views: updatedViews, viewsDict });
      },
      setViewAvailability: (viewAvailability) => {
        set({ viewAvailability });
      },
    }),
    {
      name: "serial-views-store",
      storage: createIDBStorage<PersistedViewsState>(),
      version: 1,
      partialize: (state) => ({
        views: state.views,
        viewsDict: state.viewsDict,
        viewAvailability: state.viewAvailability,
      }),
      merge: (persistedState, currentState) => {
        const merged = {
          ...currentState,
          ...(persistedState as Partial<ViewsStore>),
        };
        if (merged.views.length > 0) {
          merged.fetchStatus = "success";
        }
        return merged;
      },
    },
  ),
);

export const viewsStore = createSelectorHooks(viewsStoreApi);

export const {
  useViews,
  useFetchStatus: useViewsFetchStatus,
  useFetch: useFetchViews,
  useSet: useSetViews,
  useViewAvailability,
  useRemoveFeedReferences,
} = viewsStore;
