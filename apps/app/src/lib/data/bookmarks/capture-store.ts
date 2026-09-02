"use client";

import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { createNormalizedIDBStorage } from "../normalized-idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import type { DatabasePageCapture } from "~/server/db/schema";

type BookmarkCaptureStore = {
  capturesDict: Record<string, DatabasePageCapture>;
  reset: () => void;
  upsert: (capture: DatabasePageCapture) => void;
  remove: (bookmarkId: string) => void;
  removeMany: (bookmarkIds: Iterable<string>) => void;
};

const vanillaBookmarkCaptureStore = createStore<BookmarkCaptureStore>()(
  persist(
    (set, get) => ({
      capturesDict: {},
      reset: () => set({ capturesDict: {} }),
      upsert: (capture) =>
        set({
          capturesDict: {
            ...get().capturesDict,
            [capture.bookmarkId]: capture,
          },
        }),
      remove: (bookmarkId) => {
        if (!(bookmarkId in get().capturesDict)) return;
        const capturesDict = { ...get().capturesDict };
        delete capturesDict[bookmarkId];
        set({ capturesDict });
      },
      removeMany: (bookmarkIds) => {
        const capturesDict = { ...get().capturesDict };
        let changed = false;
        for (const bookmarkId of bookmarkIds) {
          if (!(bookmarkId in capturesDict)) continue;
          delete capturesDict[bookmarkId];
          changed = true;
        }
        if (changed) set({ capturesDict });
      },
    }),
    {
      name: "serial-bookmark-captures-store",
      storage: createNormalizedIDBStorage({
        recordFields: ["capturesDict"],
      }),
      partialize: (state) => ({ capturesDict: state.capturesDict }),
    },
  ),
);

export const bookmarkCapturesStore = createSelectorHooks(
  vanillaBookmarkCaptureStore,
);

export function useBookmarkCaptureValue(bookmarkId: string) {
  return useStore(
    vanillaBookmarkCaptureStore,
    (state) => state.capturesDict[bookmarkId],
  );
}
