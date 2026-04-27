import { clear, del, get, set } from "idb-keyval";
import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Write throttle in milliseconds. During rapid state updates (e.g. SSE chunk
 * processing), we buffer writes so that at most one IDB write happens per
 * interval. The latest value always wins.
 */
const WRITE_THROTTLE_MS = 2000;

/**
 * Creates an IndexedDB-backed storage adapter for Zustand's persist middleware.
 *
 * Uses `idb-keyval` which relies on the structured clone algorithm, so Date,
 * Set, Map, ArrayBuffer, etc. are preserved without JSON serialization.
 *
 * Writes are throttled to avoid hammering IDB during high-frequency state
 * updates (e.g. initial SSE chunk processing). A `visibilitychange` listener
 * flushes any pending write when the page is backgrounded or closed.
 */
export function createIDBStorage<T>(): PersistStorage<T> {
  // No-op storage for SSR — IndexedDB doesn't exist on the server
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }

  let writeTimeout: ReturnType<typeof setTimeout> | null = null;
  let pendingName: string | null = null;
  let pendingValue: StorageValue<T> | null = null;

  const flush = () => {
    writeTimeout = null;
    if (pendingName !== null && pendingValue !== null) {
      const name = pendingName;
      void set(pendingName, pendingValue).catch((err: unknown) => {
        const isDOMException = err instanceof DOMException;
        const isQuotaExceeded =
          isDOMException && err.name === "QuotaExceededError";
        // InvalidStateError means the DB connection was closed or deleted
        // from under us — cached data is unreliable either way.
        const isInvalidState =
          isDOMException && err.name === "InvalidStateError";

        if (isQuotaExceeded || isInvalidState) {
          console.warn(
            `[idb-storage] ${isDOMException ? err.name : "Unknown error"} writing "${name}" — clearing cache so next load does a full refresh`,
          );
          // Wipe all keys so the next page load starts with empty stores
          // and triggers a full SSE fetch instead of rehydrating stale data.
          void clear();
        } else {
          console.warn("[idb-storage] write failed:", name, err);
        }
      });
      pendingName = null;
      pendingValue = null;
    }
  };

  const flushPending = () => {
    if (writeTimeout !== null) {
      clearTimeout(writeTimeout);
    }
    flush();
  };

  // Flush on visibility change so the latest state is persisted before the
  // tab is backgrounded or discarded.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPending();
    }
  });

  // Flush on pagehide — fires reliably on page refresh, navigation, and
  // close, including on mobile. visibilitychange alone misses hard refreshes
  // on desktop and some mobile browsers, which can leave stale data in IDB.
  // IDB transactions started here will complete even after the JS context
  // is torn down, so the write is durable.
  window.addEventListener("pagehide", flushPending);

  return {
    getItem: async (name: string) => {
      return (await get<StorageValue<T>>(name)) ?? null;
    },

    setItem: (name: string, value: StorageValue<T>) => {
      pendingName = name;
      pendingValue = value;
      if (writeTimeout === null) {
        writeTimeout = setTimeout(flush, WRITE_THROTTLE_MS);
      }
    },

    removeItem: async (name: string) => {
      if (writeTimeout !== null) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      pendingName = null;
      pendingValue = null;
      await del(name);
    },
  };
}
