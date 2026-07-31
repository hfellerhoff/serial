import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createIDBStorage } from "../idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import { bookmarkManifestValue } from "./manifest";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type {
  BookmarkDiffEntry,
  BookmarkManifestEntry,
} from "~/server/mixed-content/sync";

type BookmarkStore = {
  bookmarksDict: Record<string, ApplicationBookmark>;
  reset: () => void;
  upsert: (bookmark: ApplicationBookmark) => void;
  remove: (id: string) => void;
  applyDiff: (diff: BookmarkDiffEntry[]) => void;
  manifest: () => BookmarkManifestEntry[];
};

const vanillaBookmarkStore = createStore<BookmarkStore>()(
  persist(
    (set, get) => ({
      bookmarksDict: {},
      reset: () => set({ bookmarksDict: {} }),
      upsert: (bookmark) =>
        set({
          bookmarksDict: {
            ...get().bookmarksDict,
            [bookmark.id]: bookmark,
          },
        }),
      remove: (id) => {
        const { [id]: _removed, ...bookmarksDict } = get().bookmarksDict;
        void _removed;
        set({ bookmarksDict });
      },
      applyDiff: (diff) => {
        const bookmarksDict = { ...get().bookmarksDict };
        for (const entry of diff) {
          if (entry.status === "new" || entry.status === "updated") {
            bookmarksDict[entry.bookmark.id] = entry.bookmark;
          } else if (entry.status === "deleted") {
            delete bookmarksDict[entry.id];
          }
        }
        set({ bookmarksDict });
      },
      manifest: () =>
        Object.values(get().bookmarksDict).map((bookmark) => ({
          id: bookmark.id,
          version: bookmarkManifestValue(bookmark),
        })),
    }),
    {
      name: "serial-bookmarks-store",
      storage: createIDBStorage(),
      partialize: (state) => ({ bookmarksDict: state.bookmarksDict }),
    },
  ),
);

export const bookmarksStore = createSelectorHooks(vanillaBookmarkStore);
