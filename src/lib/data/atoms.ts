import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { focusAtom } from "jotai-optics";
import { useMemo } from "react";
import superjson from "superjson";
import { z } from "zod";
import {
  type ApplicationFeedItem,
  applicationFeedItemSchema,
  type ApplicationView,
  applicationViewSchema,
  contentCategorySchema,
  type DatabaseContentCategory,
  type DatabaseFeed,
  type DatabaseFeedCategory,
  feedCategorySchema,
  feedsSchema,
} from "~/server/db/schema";

function validatedPersistedAtom<T>({
  defaultValue,
  schema,
  persistanceKey,
}: {
  defaultValue: T;
  schema: z.Schema<T>;
  persistanceKey: string;
}) {
  if (typeof window !== "undefined") {
    try {
      const persistedValue = localStorage.getItem(persistanceKey);
      if (!!persistedValue) {
        const parsedValue = superjson.parse(persistedValue);
        const validatedValue = schema.parse(parsedValue);
        defaultValue = validatedValue;
      }
    } catch (err) {
      console.warn(err);
    }
  }

  const primitiveAtom = atom(defaultValue);

  return atom(
    (get) => get(primitiveAtom),
    (_get, set, value: T) => {
      set(primitiveAtom, value);
      localStorage.setItem(persistanceKey, superjson.stringify(value));
    },
  );
}

export const hasFetchedFeedsAtom = atom(false);
export const feedsAtom = validatedPersistedAtom<DatabaseFeed[]>({
  defaultValue: [],
  schema: feedsSchema.array(),
  persistanceKey: "serial-feeds",
});

export const hasFetchedFeedItemsAtom = atom(false);
export const useHasFetchedFeedItems = () =>
  useAtomValue(hasFetchedFeedItemsAtom);

export const feedItemsOrderAtom = atom<string[]>([]);
export const useFeedItemsOrder = () => useAtomValue(feedItemsOrderAtom);

export const feedItemsMapAtom = validatedPersistedAtom<
  Record<string, ApplicationFeedItem>
>({
  defaultValue: {},
  schema: z.record(z.string(), applicationFeedItemSchema),
  persistanceKey: "serial-feed-item-map",
});
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
export const contentCategoriesAtom = validatedPersistedAtom<
  DatabaseContentCategory[]
>({
  defaultValue: [],
  schema: contentCategorySchema.array(),
  persistanceKey: "serial-content-categories",
});

export const hasFetchedFeedCategoriesAtom = atom(false);
export const feedCategoriesAtom = validatedPersistedAtom<
  DatabaseFeedCategory[]
>({
  defaultValue: [],
  schema: feedCategorySchema.array(),
  persistanceKey: "serial-feed-categories",
});

export const hasSetInitialViewAtom = atom(false);
export const hasFetchedViewsAtom = atom(false);
export const viewsAtom = validatedPersistedAtom<ApplicationView[]>({
  defaultValue: [],
  schema: applicationViewSchema.array(),
  persistanceKey: "serial-views",
});

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
