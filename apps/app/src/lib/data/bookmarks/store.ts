import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createNormalizedIDBStorage } from "../normalized-idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import { e2eBookmarkHydrationBeforeRead } from "../e2eFaultControls";
import { shouldRetainBookmarkCapture } from "../offline-content";
import { bookmarkCapturesStore } from "./capture-store";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";

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
  upsertMany: (bookmarks: ApplicationBookmark[]) => void;
  remove: (id: string) => void;
  removeMany: (ids: Iterable<string>) => void;
  pruneExcept: (retainedIds: ReadonlySet<string>) => void;
};

let bookmarkEntities: Record<string, ApplicationBookmark> = {};

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
  bookmarkEntities = { ...bookmarks };
}

function removeBookmarkEntities(ids: Iterable<string>) {
  const candidateIds = [...ids];
  bookmarkCapturesStore.getState().removeMany(candidateIds);
  const removedIds = candidateIds.filter((id) => id in bookmarkEntities);
  if (removedIds.length === 0) return false;

  const nextEntities = { ...bookmarkEntities };
  for (const id of removedIds) delete nextEntities[id];
  bookmarkEntities = nextEntities;
  return true;
}

const vanillaBookmarkStore = createStore<BookmarkStore>()(
  persist(
    (set, get) => ({
      revision: 0,
      reset: () => {
        bookmarkCapturesStore.getState().reset();
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
        if (!shouldRetainBookmarkCapture(bookmark)) {
          bookmarkCapturesStore.getState().remove(bookmark.id);
        }
        bookmarkEntities = {
          ...bookmarkEntities,
          [bookmark.id]: bookmark,
        };
        set({ revision: get().revision + 1 });
      },
      upsertMany: (bookmarks) => {
        if (bookmarks.length === 0) return;
        const nextEntities = { ...bookmarkEntities };
        for (const bookmark of bookmarks) {
          if (!shouldRetainBookmarkCapture(bookmark)) {
            bookmarkCapturesStore.getState().remove(bookmark.id);
          }
          nextEntities[bookmark.id] = bookmark;
        }
        bookmarkEntities = nextEntities;
        set({ revision: get().revision + 1 });
      },
      remove: (id) => {
        if (!removeBookmarkEntities([id])) return;
        set({ revision: get().revision + 1 });
      },
      removeMany: (ids) => {
        if (!removeBookmarkEntities(ids)) return;
        set({ revision: get().revision + 1 });
      },
      pruneExcept: (retainedIds) => {
        if (
          !removeBookmarkEntities(
            Object.keys(bookmarkEntities).filter((id) => !retainedIds.has(id)),
          )
        ) {
          return;
        }
        set({ revision: get().revision + 1 });
      },
    }),
    {
      name: "serial-bookmarks-store",
      storage: createNormalizedIDBStorage({
        recordFields: ["bookmarksDict"],
        beforeRead: e2eBookmarkHydrationBeforeRead,
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
