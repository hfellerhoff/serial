import { atom, useSetAtom } from "jotai";
import { clear } from "idb-keyval";
import { z } from "zod";
import { feedItemsStore } from "./store";
import { contentCategoriesStore } from "./content-categories/store";
import { feedCategoriesStore } from "./feed-categories/store";
import { viewFeedsStore } from "./view-feeds/store";
import { viewsStore } from "./views/store";
import { feedsStore } from "./feeds/store";
import type { ApplicationView } from "~/server/db/schema";

export const feedItemsOrderAtom = atom<string[]>([]);

export const hasSetInitialViewAtom = atom(false);
export const viewsAtom = atom<ApplicationView[]>([]);

const ALL_TIME_DATE_FILTER = 0;
export const dateFilterAtom = atom<number>(ALL_TIME_DATE_FILTER);
export const visibilityFilterSchema = z.enum(["unread", "read", "later"]);
export type VisibilityFilter = z.infer<typeof visibilityFilterSchema>;
export const visibilityFilterAtom = atom<VisibilityFilter>("unread");
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

  return () => {
    resetFeeds();
    resetFeedItems();
    resetContentCategories();
    resetFeedCategories();
    resetViewFeeds();
    resetViews();
    setViewsAtom([]);
    // Wipe all persisted state from IndexedDB immediately.
    // The reset() calls handle in-memory state but write through a 2-second
    // throttle — clear() bypasses that so nothing survives sign-out.
    void clear();
  };
};

export const viewAtom = atom<"windowed" | "fullscreen">("windowed");
export const longformVideoZoomAtom = atom<number>(3);
export const shortformVideoZoomAtom = atom<number>(2);
export const articleZoomAtom = atom<number>(1);

export const selectedItemIdAtom = atom<string | null>(null);
export const softReadItemIdsAtom = atom<Set<string>>(new Set<string>());
export const isReturningFromRouteAtom = atom(false);
export const altKeyHeldAtom = atom(false);

/** When true, the header and footer bars should be hidden (e.g. scrolling down in article view). */
export const barsHiddenAtom = atom(false);
