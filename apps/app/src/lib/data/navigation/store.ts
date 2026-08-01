import { createStore } from "zustand";
import { createSelectorHooks } from "../createSelectorHooks";
import type {
  NavigationAvailability,
  NavigationSnapshot,
} from "~/server/navigation/snapshot";
import { orpcRouterClient } from "~/lib/orpc";

const EMPTY_SNAPSHOT: NavigationSnapshot = {
  views: {},
  tags: {},
  feeds: {},
};

type NavigationSnapshotStore = {
  snapshot: NavigationSnapshot;
  fetchStatus: "idle" | "fetching" | "success";
  reset: () => void;
  set: (snapshot: NavigationSnapshot) => void;
  fetch: () => Promise<void>;
};

let activeFetch: Promise<void> | null = null;
let refetchRequested = false;
let requestGeneration = 0;

const vanillaNavigationSnapshotStore = createStore<NavigationSnapshotStore>()(
  (set) => ({
    snapshot: EMPTY_SNAPSHOT,
    fetchStatus: "idle",
    reset: () => {
      requestGeneration++;
      refetchRequested = false;
      set({ snapshot: EMPTY_SNAPSHOT, fetchStatus: "idle" });
    },
    set: (snapshot) => set({ snapshot, fetchStatus: "success" }),
    fetch: async () => {
      if (activeFetch) {
        refetchRequested = true;
        return activeFetch;
      }
      activeFetch = (async () => {
        do {
          refetchRequested = false;
          const fetchGeneration = requestGeneration;
          set({ fetchStatus: "fetching" });
          try {
            const snapshot =
              await orpcRouterClient.initial.getNavigationSnapshot();
            if (fetchGeneration === requestGeneration) {
              set({ snapshot, fetchStatus: "success" });
            }
          } catch (error) {
            if (fetchGeneration === requestGeneration) {
              set({ fetchStatus: "idle" });
            }
            throw error;
          }
        } while (refetchRequested);
      })();
      try {
        await activeFetch;
      } finally {
        activeFetch = null;
      }
    },
  }),
);

export const navigationSnapshotStore = createSelectorHooks(
  vanillaNavigationSnapshotStore,
);

export function getNavigationAvailability(
  availability: Record<number, NavigationAvailability>,
  id: number,
): NavigationAvailability {
  return availability[id] ?? { unread: false, read: false, later: false };
}

export const {
  useSnapshot: useNavigationSnapshot,
  useFetchStatus: useNavigationSnapshotStatus,
} = navigationSnapshotStore;

export function refreshNavigationSnapshot() {
  return navigationSnapshotStore.getState().fetch();
}

export async function refreshNavigationSnapshotSafely() {
  if (typeof window === "undefined") return;
  try {
    await refreshNavigationSnapshot();
  } catch (error) {
    console.error("Failed to refresh navigation snapshot", error);
  }
}
