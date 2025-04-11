import { atom, useAtom, useAtomValue } from "jotai";
import { focusAtom } from "jotai-optics";
import { useMemo } from "react";
import superjson from "superjson";
import { z } from "zod";
import {
  contentCategorySchema,
  type DatabaseContentCategory,
  type DatabaseFeed,
  type DatabaseFeedCategory,
  type DatabaseFeedItem,
  feedCategorySchema,
  feedItemSchema,
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

export const feedItemsOrderAtom = validatedPersistedAtom<string[]>({
  defaultValue: [],
  schema: z.string().array(),
  persistanceKey: "serial-feed-item-order",
});
export const useFeedItemsOrder = () => useAtomValue(feedItemsOrderAtom);

export const feedItemsMapAtom = validatedPersistedAtom<
  Record<string, DatabaseFeedItem>
>({
  defaultValue: {},
  schema: z.record(z.string(), feedItemSchema),
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

export const dateFilterAtom = atom<number>(1);
const visibilityFilterSchema = z.enum(["unread", "later", "videos", "shorts"]);
export type VisibilityFilter = z.infer<typeof visibilityFilterSchema>;
export const visibilityFilterAtom = atom<VisibilityFilter>("unread");
export const categoryFilterAtom = atom<number>(-1);
