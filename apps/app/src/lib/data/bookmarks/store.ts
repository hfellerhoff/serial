import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createNormalizedIDBStorage } from "../normalized-idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import { buildBookmarkSyncManifest, getBookmarkSyncBucket } from "./manifest";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { BookmarkSyncBucketPage } from "~/server/mixed-content/sync";
import type { BookmarkSyncManifestEntry } from "./manifest";

type BookmarkStore = {
  bookmarksDict: Record<string, ApplicationBookmark>;
  reset: () => void;
  upsert: (bookmark: ApplicationBookmark) => void;
  upsertMany: (bookmarks: ApplicationBookmark[]) => void;
  remove: (id: string) => void;
  applySyncPage: (page: BookmarkSyncBucketPage) => void;
  applySyncPages: (pages: BookmarkSyncBucketPage[]) => void;
  manifest: () => BookmarkSyncManifestEntry[];
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
      upsertMany: (bookmarks) => {
        if (bookmarks.length === 0) return;
        const bookmarksDict = { ...get().bookmarksDict };
        for (const bookmark of bookmarks) {
          bookmarksDict[bookmark.id] = bookmark;
        }
        set({ bookmarksDict });
      },
      remove: (id) => {
        const { [id]: _removed, ...bookmarksDict } = get().bookmarksDict;
        void _removed;
        set({ bookmarksDict });
      },
      applySyncPage: (page) => {
        get().applySyncPages([page]);
      },
      applySyncPages: (pages) => {
        if (pages.length === 0) return;
        const bookmarksDict = { ...get().bookmarksDict };
        const replacedBuckets = new Set(
          pages
            .filter((page) => page.replacesBucket)
            .map((page) => page.bucket),
        );
        if (replacedBuckets.size > 0) {
          for (const bookmark of Object.values(bookmarksDict)) {
            if (replacedBuckets.has(getBookmarkSyncBucket(bookmark.id))) {
              delete bookmarksDict[bookmark.id];
            }
          }
        }
        for (const page of pages) {
          for (const bookmark of page.bookmarks) {
            bookmarksDict[bookmark.id] = bookmark;
          }
        }
        set({ bookmarksDict });
      },
      manifest: () =>
        buildBookmarkSyncManifest(Object.values(get().bookmarksDict)),
    }),
    {
      name: "serial-bookmarks-store",
      storage: createNormalizedIDBStorage({
        recordFields: ["bookmarksDict"],
      }),
      partialize: (state) => ({ bookmarksDict: state.bookmarksDict }),
    },
  ),
);

export const bookmarksStore = createSelectorHooks(vanillaBookmarkStore);
