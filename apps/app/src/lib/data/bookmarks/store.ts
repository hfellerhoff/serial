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

type PersistedBookmarkStore = {
  bookmarksDict: Record<string, ApplicationBookmark>;
};

type BookmarkStore = {
  revision: number;
  reset: () => void;
  replace: (bookmarks: Record<string, ApplicationBookmark>) => void;
  getBookmark: (id: string) => ApplicationBookmark | undefined;
  snapshot: () => Record<string, ApplicationBookmark>;
  upsert: (bookmark: ApplicationBookmark) => void;
  remove: (id: string) => void;
  applyDiff: (diff: BookmarkDiffEntry[]) => void;
  manifest: () => BookmarkManifestEntry[];
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
      remove: (id) => {
        delete bookmarkEntities[id];
        set({ revision: get().revision + 1 });
      },
      applyDiff: (diff) => {
        for (const entry of diff) {
          if (entry.status === "new" || entry.status === "updated") {
            bookmarkEntities[entry.bookmark.id] = entry.bookmark;
          } else if (entry.status === "deleted") {
            delete bookmarkEntities[entry.id];
          }
        }
        set({ revision: get().revision + 1 });
      },
      manifest: () =>
        Object.values(bookmarkEntities).map((bookmark) => ({
          id: bookmark.id,
          version: bookmarkManifestValue(bookmark),
        })),
    }),
    {
      name: "serial-bookmarks-store",
      storage: createIDBStorage(),
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
