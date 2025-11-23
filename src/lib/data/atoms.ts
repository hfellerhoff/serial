import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useMemo } from "react";
import { z } from "zod";
import type {
  ApplicationFeed,
  ApplicationFeedItem,
  ApplicationView,
  DatabaseContentCategory,
  DatabaseFeedCategory,
} from "~/server/db/schema";
import { feedItemsStore } from "./store";

export const hasFetchedFeedsAtom = atom(false);
export const feedsAtom = atom<ApplicationFeed[]>([]);

export const feedItemsOrderAtom = atom<string[]>([]);

export const hasFetchedContentCategoriesAtom = atom(false);
export const contentCategoriesAtom = atom<DatabaseContentCategory[]>([]);

export const hasFetchedFeedCategoriesAtom = atom(false);
export const feedCategoriesAtom = atom<DatabaseFeedCategory[]>([]);

export const hasSetInitialViewAtom = atom(false);
export const hasFetchedViewsAtom = atom(false);
export const viewsAtom = atom<ApplicationView[]>([]);

export const dateFilterAtom = atom<number>(1);
export const visibilityFilterSchema = z.enum([
  "unread",
  "later",
  "videos",
  "shorts",
]);
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
  const setFeedsAtom = useSetAtom(feedsAtom);
  const resetFeedItems = feedItemsStore.useReset();
  const setContentCategoriesAtom = useSetAtom(contentCategoriesAtom);
  const setFeedCategoriesAtom = useSetAtom(feedCategoriesAtom);
  const setViewsAtom = useSetAtom(viewsAtom);

  return () => {
    setFeedsAtom([]);
    resetFeedItems();
    setContentCategoriesAtom([]);
    setFeedCategoriesAtom([]);
    setViewsAtom([]);
  };
};

export const viewAtom = atom<"windowed" | "fullscreen">("windowed");
export const videoZoomAtom = atom<number>(3);
export const articleZoomAtom = atom<number>(1);
