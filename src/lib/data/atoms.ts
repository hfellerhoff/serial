import { atom, useSetAtom } from "jotai";
import { z } from "zod";
import { feedItemsStore } from "./store";
import { contentCategoriesStore } from "./content-categories/store";
import { feedCategoriesStore } from "./feed-categories/store";
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
  const resetViews = viewsStore.useReset();
  const setViewsAtom = useSetAtom(viewsAtom);

  return () => {
    resetFeeds();
    resetFeedItems();
    resetContentCategories();
    resetFeedCategories();
    resetViews();
    setViewsAtom([]);
  };
};

export const viewAtom = atom<"windowed" | "fullscreen">("windowed");
export const longformVideoZoomAtom = atom<number>(3);
export const shortformVideoZoomAtom = atom<number>(2);
export const articleZoomAtom = atom<number>(1);
