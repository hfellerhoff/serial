import { atom } from "jotai";
import {
  DatabaseContentCategory,
  DatabaseFeed,
  DatabaseFeedCategory,
  DatabaseFeedItem,
} from "~/server/db/schema";

export const feedsAtom = atom<DatabaseFeed[]>([]);
export const feedItemsAtom = atom<DatabaseFeedItem[]>([]);
export const contentCategoriesAtom = atom<DatabaseContentCategory[]>([]);
export const feedCategoriesAtom = atom<DatabaseFeedCategory[]>([]);

export const dateFilterAtom = atom<number>(1);
export type VisibilityFilter = "all" | "unread" | "later";
export const visibilityFilterAtom = atom<VisibilityFilter>("unread");
export const categoryFilterAtom = atom<number>(-1);
