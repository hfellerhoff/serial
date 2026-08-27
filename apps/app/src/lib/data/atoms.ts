import { atom, useSetAtom } from "jotai";
import { clear } from "idb-keyval";
import { feedItemsStore } from "./store";
import { contentCategoriesStore } from "./content-categories/store";
import { feedCategoriesStore } from "./feed-categories/store";
import { viewFeedsStore } from "./view-feeds/store";
import { viewsStore } from "./views/store";
import { feedsStore } from "./feeds/store";
import { bookmarksStore } from "./bookmarks/store";
import { bookmarkCapturesStore } from "./bookmarks/capture-store";
import { mixedContentStore } from "./mixed-content/store";
import { navigationSnapshotStore } from "./navigation/store";
import type { ApplicationView } from "~/server/db/schema";
import type { ContentStatusFilter } from "~/lib/content-status";
import { DEFAULT_CONTENT_STATUS_FILTER } from "~/lib/content-status";

export const viewsAtom = atom<ApplicationView[]>([]);

const ALL_TIME_DATE_FILTER = 0;
export const dateFilterAtom = atom<number>(ALL_TIME_DATE_FILTER);
export const contentStatusFilterAtom = atom<ContentStatusFilter>(
  DEFAULT_CONTENT_STATUS_FILTER,
);
export const categoryFilterAtom = atom<number>(-1);
export const feedFilterAtom = atom<number>(-1);

export const UNSELECTED_VIEW_ID = -100;
export const viewFilterIdAtom = atom<number>(UNSELECTED_VIEW_ID);
export const viewFilterAtom = atom<ApplicationView | null>((get) => {
  const views = get(viewsAtom);
  const viewId = get(viewFilterIdAtom);
  return views.find((view) => view.id === viewId) || null;
});

export const useClearAllUserData = () => {
  const resetFeeds = feedsStore.useReset();
  const resetFeedItems = feedItemsStore.useReset();
  const resetContentCategories = contentCategoriesStore.useReset();
  const resetFeedCategories = feedCategoriesStore.useReset();
  const resetViewFeeds = viewFeedsStore.useReset();
  const resetViews = viewsStore.useReset();
  const setViewsAtom = useSetAtom(viewsAtom);
  const setConnectionState = useSetAtom(connectionStateAtom);
  const resetBookmarks = bookmarksStore.useReset();
  const resetBookmarkCaptures = bookmarkCapturesStore.useReset();
  const resetMixedContent = mixedContentStore.useReset();
  const resetNavigationSnapshot = navigationSnapshotStore.useReset();

  return () => {
    resetFeeds();
    resetFeedItems();
    resetContentCategories();
    resetFeedCategories();
    resetViewFeeds();
    resetViews();
    resetBookmarks();
    resetBookmarkCaptures();
    resetMixedContent();
    resetNavigationSnapshot();
    setViewsAtom([]);
    setConnectionState("unknown");
    // Wipe all persisted state from IndexedDB immediately.
    // The reset() calls handle in-memory state but write through a 2-second
    // throttle — clear() bypasses that so nothing survives sign-out.
    clear().catch((error: unknown) => {
      console.warn("Failed to clear persisted state on sign-out", error);
    });
  };
};

export const viewAtom = atom<"windowed" | "fullscreen">("windowed");
export const longformVideoZoomAtom = atom<number>(3);
export const shortformVideoZoomAtom = atom<number>(2);
export const articleZoomAtom = atom<number>(1);

export const selectedItemIdAtom = atom<string | null>(null);
export const altKeyHeldAtom = atom(false);

export type ConnectionState = "unknown" | "connected" | "disconnected";
export const connectionStateAtom = atom<ConnectionState>("unknown");
export const isDisconnectedAtom = atom(
  (get) => get(connectionStateAtom) === "disconnected",
);

/** When true, the header and footer bars should be hidden (e.g. scrolling down in article view). */
export const barsHiddenAtom = atom(false);

/** When true, the SSE connection should stay open even when the page is hidden/defocused. */
export const shouldAlwaysKeepSSEConnectionAlive = atom(false);
