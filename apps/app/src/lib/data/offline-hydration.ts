"use client";

import { orpcRouterClient } from "../orpc";
import { bookmarkCapturesStore } from "./bookmarks/capture-store";
import {
  isEligibleFeedBody,
  shouldRetainBookmarkCapture,
} from "./offline-content";
import { feedItemsStore, retainLoadedFeedItemBodies } from "./store";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";

const CAPTURE_BATCH_SIZE = 100;

/**
 * Page-scoped body hydration: only the Saved, Unread text items on the page
 * that was just applied. Unfetched library pages are never scanned.
 */
export function planPageBodyHydration(input: {
  feedItems: readonly ApplicationFeedItem[];
  bookmarks: readonly ApplicationBookmark[];
  hasRetainedFeedBody: (id: string) => boolean;
  hasBookmarkCapture: (id: string) => boolean;
}) {
  const retainLoadedFeedItemIds: string[] = [];
  const fetchFeedItemIds: string[] = [];
  for (const item of input.feedItems) {
    if (item.contentType !== "text" || item.isWatched || !item.isWatchLater) {
      continue;
    }
    if (!isEligibleFeedBody(item)) {
      fetchFeedItemIds.push(item.id);
    } else if (!input.hasRetainedFeedBody(item.id)) {
      retainLoadedFeedItemIds.push(item.id);
    }
  }
  const fetchBookmarkIds = input.bookmarks.flatMap((bookmark) =>
    bookmark.isSaved &&
    bookmark.captureHash &&
    shouldRetainBookmarkCapture(bookmark) &&
    !input.hasBookmarkCapture(bookmark.id)
      ? [bookmark.id]
      : [],
  );
  return { retainLoadedFeedItemIds, fetchFeedItemIds, fetchBookmarkIds };
}

async function hydrateFeedItemBodies(itemIds: string[]) {
  if (itemIds.length === 0) return;
  try {
    const items = await orpcRouterClient.initial.requestFullTextForItems({
      itemIds,
    });
    feedItemsStore.getState().applyFulltextItems(items);
  } catch {
    // No offline outbox: the next page application retries hydration.
  }
}

async function hydrateBookmarkCaptures(bookmarkIds: string[]) {
  for (let index = 0; index < bookmarkIds.length; index += CAPTURE_BATCH_SIZE) {
    try {
      const captures = await orpcRouterClient.bookmark.getCaptures({
        bookmarkIds: bookmarkIds.slice(index, index + CAPTURE_BATCH_SIZE),
      });
      for (const capture of captures) {
        bookmarkCapturesStore.getState().upsert(capture);
      }
    } catch {
      // No offline outbox: the next page application retries hydration.
    }
  }
}

export async function hydrateOfflineBodiesForPage(page: {
  feedItems: readonly ApplicationFeedItem[];
  bookmarks: readonly ApplicationBookmark[];
}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  // Hydration must not lengthen the page-application task it follows.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const plan = planPageBodyHydration({
    feedItems: page.feedItems,
    bookmarks: page.bookmarks,
    hasRetainedFeedBody: (id) =>
      feedItemsStore.getState().retainedFeedItemBodyIds[id] === true,
    hasBookmarkCapture: (id) =>
      bookmarkCapturesStore.getState().capturesDict[id] !== undefined,
  });
  retainLoadedFeedItemBodies(plan.retainLoadedFeedItemIds);
  await Promise.all([
    hydrateFeedItemBodies(plan.fetchFeedItemIds),
    hydrateBookmarkCaptures(plan.fetchBookmarkIds),
  ]);
}
