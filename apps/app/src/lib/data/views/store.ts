import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createSelectorHooks } from "../createSelectorHooks";
import { createIDBStorage } from "../idb-storage";
import { sortViewsByPlacement } from "./utils";
import type { ApplicationView } from "~/server/db/schema";
import { orpcRouterClient } from "~/lib/orpc";

export type ViewsStore = {
  reset: () => void;
  views: ApplicationView[];
  viewsDict: Record<number, ApplicationView>;
  /** Bumped on every write so an in-flight fetch can detect it went stale. */
  revision: number;
  fetchStatus: "idle" | "fetching" | "success";
  fetch: () => Promise<void>;
  set: (views: ApplicationView[]) => void;
  add: (view: ApplicationView) => void;
  update: (id: number, view: Partial<ApplicationView>) => void;
  remove: (id: number) => void;
  removeFeedReferences: (feedIds: number[]) => void;
};

export type PersistedViewsState = Pick<ViewsStore, "views" | "viewsDict">;

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

let inFlightFetch: Promise<void> | null = null;

// A request that hangs rather than rejecting (dropped mobile radio) must not
// gate every later view fetch for the browser's own multi-minute timeout.
const VIEW_FETCH_TIMEOUT_MS = 30_000;

export const viewsStoreApi = createStore<ViewsStore>()(
  persist<ViewsStore, [], [], PersistedViewsState>(
    (set, get) => ({
      reset: () => {
        // Sever the in-flight fetch (sign-out clears the store for the next
        // session): its eventual settle must not gate or short-circuit that
        // session's first fetch.
        inFlightFetch = null;
        set({
          views: [],
          viewsDict: {},
          revision: get().revision + 1,
          fetchStatus: "idle",
        });
      },
      views: [],
      viewsDict: {},
      revision: 0,
      fetchStatus: "idle",

      fetch: () => {
        // Callers awaiting a refetch must wait for the actual result, so a
        // concurrent call joins the in-flight request instead of resolving
        // against whatever is in the store.
        if (inFlightFetch) return inFlightFetch;

        set({ fetchStatus: "fetching" });

        let thisFetch: Promise<void> | null = null;
        thisFetch = (async () => {
          try {
            // A write landing while the request is in flight (an import
            // stream chunk, another mutation's reset) makes the response
            // stale, and callers empty the store before fetching — so a
            // stale response must be replaced by a fresh one, never applied
            // or dropped.
            let lastResponse: ApplicationView[] | null = null;
            for (let attempt = 0; attempt < 5; attempt++) {
              const startRevision = get().revision;
              const data = await orpcRouterClient.view.getAll(undefined, {
                signal: AbortSignal.timeout(VIEW_FETCH_TIMEOUT_MS),
              });
              lastResponse = data;
              if (get().revision !== startRevision) continue;

              const dict: Record<number, ApplicationView> = {};
              data.forEach((view) => {
                dict[view.id] = view;
              });

              set({
                views: data,
                viewsDict: dict,
                revision: get().revision + 1,
                fetchStatus: "success",
              });
              return;
            }
            // Writes kept racing the refetches. A non-empty store keeps its
            // latest written state; an empty one is a cleared store awaiting
            // data, where even a slightly stale response beats stranding the
            // caller with nothing.
            if (get().views.length === 0 && lastResponse) {
              const dict: Record<number, ApplicationView> = {};
              lastResponse.forEach((view) => {
                dict[view.id] = view;
              });
              set({
                views: lastResponse,
                viewsDict: dict,
                revision: get().revision + 1,
                fetchStatus: "success",
              });
              return;
            }
            set({
              fetchStatus: get().views.length > 0 ? "success" : "idle",
            });
          } catch (error) {
            set({ fetchStatus: "idle" });
            throw error;
          } finally {
            // A reset may have severed this run and a newer fetch may
            // already be in flight; only clear our own registration.
            if (inFlightFetch === thisFetch) inFlightFetch = null;
          }
        })();
        inFlightFetch = thisFetch;
        return thisFetch;
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
          revision: get().revision + 1,
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
          revision: get().revision + 1,
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
          revision: get().revision + 1,
        });
      },

      remove: (id) => {
        const { [id]: _removed, ...rest } = get().viewsDict;
        void _removed;
        const newViews = get().views.filter((v) => v.id !== id);

        set({
          views: newViews,
          viewsDict: rest,
          revision: get().revision + 1,
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

        set({
          views: updatedViews,
          viewsDict,
          revision: get().revision + 1,
        });
      },
    }),
    {
      name: "serial-views-store",
      storage: createIDBStorage<PersistedViewsState>(),
      version: 2,
      partialize: (state) => ({
        views: state.views,
        viewsDict: state.viewsDict,
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
  useRemoveFeedReferences,
} = viewsStore;
