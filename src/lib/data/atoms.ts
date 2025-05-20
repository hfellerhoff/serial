import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useMemo } from "react";
import { z } from "zod";
import {
  type ApplicationFeedItem,
  type ApplicationView,
  type DatabaseContentCategory,
  type DatabaseFeed,
  type DatabaseFeedCategory,
} from "~/server/db/schema";

export const hasFetchedFeedsAtom = atom(false);
export const feedsAtom = atom<DatabaseFeed[]>([]);

export const hasFetchedFeedItemsAtom = atom(false);
export const useHasFetchedFeedItems = () =>
  useAtomValue(hasFetchedFeedItemsAtom);

export const feedItemsOrderAtom = atom<string[]>([]);
export const useFeedItemsOrder = () => useAtomValue(feedItemsOrderAtom);

export const feedItemsMapAtom = atom<Record<string, ApplicationFeedItem>>({});
export const useFeedItemsMap = () => useAtomValue(feedItemsMapAtom);

export function useFeedItemAtom(contentId: string) {
  return useMemo(() => {
    return focusAtom(feedItemsMapAtom, (optic) => optic.prop(contentId));
  }, [contentId]);
}
export type FeedItemAtom = ReturnType<typeof useFeedItemAtom>;

export function useFeedItemGlobalState(contentId: string) {
  const feedItemAtom = useFeedItemAtom(contentId);
  return useAtom(feedItemAtom);
}

export type FeedItemStateSetter = ReturnType<typeof useFeedItemGlobalState>[1];

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
  const setFeedItemsMapAtom = useSetAtom(feedItemsMapAtom);
  const setContentCategoriesAtom = useSetAtom(contentCategoriesAtom);
  const setFeedCategoriesAtom = useSetAtom(feedCategoriesAtom);
  const setViewsAtom = useSetAtom(viewsAtom);

  return () => {
    setFeedsAtom([]);
    setFeedItemsMapAtom({});
    setContentCategoriesAtom([]);
    setFeedCategoriesAtom([]);
    setViewsAtom([]);
  };
};
