import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createNormalizedIDBStorage } from "../normalized-idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import { buildBookmarkSyncManifest, getBookmarkSyncBucket } from "./manifest";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { BookmarkSyncBucketPage } from "~/server/mixed-content/sync";
import type { BookmarkSyncManifestEntry } from "./manifest";

type PersistedBookmarkStore = {
  bookmarksDict: Record<string, ApplicationBookmark>;
};

export type BookmarkSyncDelta = {
  upserts: Array<{
    bookmark: ApplicationBookmark;
    previousBookmark: ApplicationBookmark | undefined;
  }>;
  deletions: ApplicationBookmark[];
};

type BookmarkStore = {
  revision: number;
  reset: () => void;
  replace: (bookmarks: Record<string, ApplicationBookmark>) => void;
  getBookmark: (id: string) => ApplicationBookmark | undefined;
  snapshot: () => Record<string, ApplicationBookmark>;
  upsert: (bookmark: ApplicationBookmark) => void;
  upsertMany: (bookmarks: ApplicationBookmark[]) => void;
  remove: (id: string) => void;
  applySyncPage: (page: BookmarkSyncBucketPage) => BookmarkSyncDelta;
  applySyncPages: (pages: BookmarkSyncBucketPage[]) => BookmarkSyncDelta;
  manifest: () => BookmarkSyncManifestEntry[];
};

const bookmarkEntities: Record<string, ApplicationBookmark> = {};

function isPersistedBookmarkStore(
  value: unknown,
): value is PersistedBookmarkStore {
  return (
    typeof value === "object" && value !== null && "bookmarksDict" in value
  );
}

function replaceBookmarkEntities(
  bookmarks: Record<string, ApplicationBookmark>,
) {
  for (const id of Object.keys(bookmarkEntities)) delete bookmarkEntities[id];
  Object.assign(bookmarkEntities, bookmarks);
}

const vanillaBookmarkStore = createStore<BookmarkStore>()(
  persist(
    (set, get) => ({
      revision: 0,
      reset: () => {
        replaceBookmarkEntities({});
        set({ revision: get().revision + 1 });
      },
      replace: (bookmarks) => {
        replaceBookmarkEntities(bookmarks);
        set({ revision: get().revision + 1 });
      },
      getBookmark: (id) => bookmarkEntities[id],
      snapshot: () => bookmarkEntities,
      upsert: (bookmark) => {
        bookmarkEntities[bookmark.id] = bookmark;
        set({ revision: get().revision + 1 });
      },
      upsertMany: (bookmarks) => {
        if (bookmarks.length === 0) return;
        for (const bookmark of bookmarks) {
          bookmarkEntities[bookmark.id] = bookmark;
        }
        set({ revision: get().revision + 1 });
      },
      remove: (id) => {
        delete bookmarkEntities[id];
        set({ revision: get().revision + 1 });
      },
      applySyncPage: (page) => {
        return get().applySyncPages([page]);
      },
      applySyncPages: (pages) => {
        if (pages.length === 0) return { upserts: [], deletions: [] };
        const replacedBuckets = new Set(
          pages
            .filter((page) => page.replacesBucket)
            .map((page) => page.bucket),
        );
        const previousById = new Map<string, ApplicationBookmark>();
        for (const bookmark of Object.values(bookmarkEntities)) {
          if (replacedBuckets.has(getBookmarkSyncBucket(bookmark.id))) {
            previousById.set(bookmark.id, bookmark);
            delete bookmarkEntities[bookmark.id];
          }
        }
        const incomingById = new Map<string, ApplicationBookmark>();
        for (const page of pages) {
          for (const bookmark of page.bookmarks) {
            if (!previousById.has(bookmark.id)) {
              const previous = bookmarkEntities[bookmark.id];
              if (previous) previousById.set(bookmark.id, previous);
            }
            incomingById.set(bookmark.id, bookmark);
            bookmarkEntities[bookmark.id] = bookmark;
          }
        }
        set({ revision: get().revision + 1 });
        return {
          upserts: [...incomingById.values()].map((bookmark) => ({
            bookmark,
            previousBookmark: previousById.get(bookmark.id),
          })),
          deletions: [...previousById.values()].filter(
            (bookmark) =>
              replacedBuckets.has(getBookmarkSyncBucket(bookmark.id)) &&
              !incomingById.has(bookmark.id),
          ),
        };
      },
      manifest: () =>
        buildBookmarkSyncManifest(Object.values(bookmarkEntities)),
    }),
    {
      name: "serial-bookmarks-store",
      storage: createNormalizedIDBStorage({
        recordFields: ["bookmarksDict"],
      }),
      partialize: () => ({ bookmarksDict: bookmarkEntities }),
      merge: (persistedState, currentState) => {
        if (isPersistedBookmarkStore(persistedState)) {
          replaceBookmarkEntities(persistedState.bookmarksDict);
        }
        return currentState;
      },
    },
  ),
);

export const bookmarksStore = createSelectorHooks(vanillaBookmarkStore);
