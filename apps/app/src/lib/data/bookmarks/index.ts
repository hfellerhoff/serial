"use client";

import { bookmarksStore } from "./store";

export { bookmarksStore } from "./store";

export function useBookmarkValue(id: string) {
  bookmarksStore.useRevision();
  return bookmarksStore.getState().getBookmark(id);
}
