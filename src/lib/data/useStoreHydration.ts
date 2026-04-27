import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand";

type PersistApi = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

function asPersist(store: StoreApi<unknown>): PersistApi {
  return store as unknown as PersistApi;
}

/**
 * Creates a React hook that returns `true` once every provided store has
 * finished rehydrating from IndexedDB. Returns `false` on the server and
 * during the initial client render while IDB reads are in-flight.
 *
 * Usage:
 * ```ts
 * const useStoresHydrated = createHydrationHook(storeA, storeB, storeC);
 * ```
 */
export function createHydrationHook(
  ...stores: Array<StoreApi<unknown>>
): () => boolean {
  const persistStores = stores.map(asPersist);

  function subscribe(callback: () => void): () => void {
    const unsubs = persistStores.map((store) =>
      store.persist.onFinishHydration(callback),
    );
    return () => unsubs.forEach((unsub) => unsub());
  }

  function getSnapshot(): boolean {
    return persistStores.every((store) => store.persist.hasHydrated());
  }

  function getServerSnapshot(): boolean {
    return false;
  }

  return function useStoresHydrated(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  };
}
