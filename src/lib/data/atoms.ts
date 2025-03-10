import { atom } from "jotai";
import {
  DatabaseContentCategories,
  DatabaseFeed,
  DatabaseFeedCategories,
  DatabaseFeedItem,
} from "~/server/db/schema";

export const feedsAtom = atom<DatabaseFeed[]>([]);
export const feedItemsAtom = atom<DatabaseFeedItem[]>([]);
export const contentCategoriesAtom = atom<DatabaseContentCategories[]>([]);
export const feedCategoriesAtom = atom<DatabaseFeedCategories[]>([]);

export const dateFilterAtom = atom<number>(1);
export type VisibilityFilter = "all" | "unread" | "later";
export const visibilityFilterAtom = atom<VisibilityFilter>("unread");
export const categoryFilterAtom = atom<number>(-1);
