"use client";

import { orpcRouterClient } from "../orpc";
import { bookmarkCapturesStore } from "./bookmarks/capture-store";
import { bookmarksStore } from "./bookmarks/store";
import {
  isEligibleFeedBody,
  shouldRetainBookmarkCapture,
} from "./offline-content";
import { feedItemsStore, retainLoadedFeedItemBodies } from "./store";
import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";

const FULLTEXT_BATCH_SIZE = 500;
const CAPTURE_BATCH_SIZE = 100;

// Failed requests retry on the next page application even when that page no
// longer carries the entity (the active target diffs to `unchanged`, so a
// retry keyed only on page upserts would never fire for it). Ids whose fetch
// succeeded without yielding content can never hydrate this session and must
// not be re-requested on every page application.
const failedFeedItemIds = new Set<string>();
const failedBookmarkIds = new Set<string>();
const unavailableFeedItemIds = new Set<string>();
const unavailableBookmarkIds = new Set<string>();

// Bumped on sign-out so an in-flight response cannot repopulate cleared
// stores (and, through their persistence, IndexedDB) with the previous
// user's content.
let hydrationEpoch = 0;

export function invalidateOfflineHydration() {
  hydrationEpoch += 1;
  failedFeedItemIds.clear();
  failedBookmarkIds.clear();
  unavailableFeedItemIds.clear();
  unavailableBookmarkIds.clear();
}

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
    bookmark.captureHash &&
    shouldRetainBookmarkCapture(bookmark) &&
    !input.hasBookmarkCapture(bookmark.id)
      ? [bookmark.id]
      : [],
  );
  return { retainLoadedFeedItemIds, fetchFeedItemIds, fetchBookmarkIds };
}

// Failed ids re-enter planning through their current store entities so the
// original eligibility rules keep applying; ids that stopped qualifying (or
// already hydrated through a later payload) leave the retry set.
function takeFeedItemRetries() {
  const { feedItemsDict } = feedItemsStore.getState();
  const items: ApplicationFeedItem[] = [];
  for (const id of [...failedFeedItemIds]) {
    const item = feedItemsDict[id];
    const qualifies =
      item !== undefined &&
      item.contentType === "text" &&
      !item.isWatched &&
      item.isWatchLater;
    if (!qualifies || isEligibleFeedBody(item)) failedFeedItemIds.delete(id);
    if (qualifies) items.push(item);
  }
  return items;
}

function takeBookmarkRetries() {
  const bookmarks: ApplicationBookmark[] = [];
  for (const id of [...failedBookmarkIds]) {
    const bookmark = bookmarksStore.getState().getBookmark(id);
    if (
      !bookmark?.captureHash ||
      !shouldRetainBookmarkCapture(bookmark) ||
      bookmarkCapturesStore.getState().capturesDict[id] !== undefined
    ) {
      failedBookmarkIds.delete(id);
      continue;
    }
    bookmarks.push(bookmark);
  }
  return bookmarks;
}

async function hydrateFeedItemBodies(itemIds: string[], epoch: number) {
  for (let index = 0; index < itemIds.length; index += FULLTEXT_BATCH_SIZE) {
    const batch = itemIds.slice(index, index + FULLTEXT_BATCH_SIZE);
    try {
      const items = await orpcRouterClient.initial.requestFullTextForItems({
        itemIds: batch,
      });
      if (epoch !== hydrationEpoch) return;
      const returnedById = new Map(items.map((item) => [item.id, item]));
      for (const id of batch) {
        failedFeedItemIds.delete(id);
        if (!returnedById.get(id)?.content.trim()) {
          unavailableFeedItemIds.add(id);
        }
      }
      feedItemsStore.getState().applyFulltextItems(items);
    } catch {
      if (epoch !== hydrationEpoch) return;
      for (const id of batch) failedFeedItemIds.add(id);
    }
  }
}

async function hydrateBookmarkCaptures(bookmarkIds: string[], epoch: number) {
  for (let index = 0; index < bookmarkIds.length; index += CAPTURE_BATCH_SIZE) {
    const batch = bookmarkIds.slice(index, index + CAPTURE_BATCH_SIZE);
    try {
      const captures = await orpcRouterClient.bookmark.getCaptures({
        bookmarkIds: batch,
      });
      if (epoch !== hydrationEpoch) return;
      const returnedIds = new Set(
        captures.map((capture) => capture.bookmarkId),
      );
      for (const id of batch) {
        failedBookmarkIds.delete(id);
        if (!returnedIds.has(id)) unavailableBookmarkIds.add(id);
      }
      for (const capture of captures) {
        bookmarkCapturesStore.getState().upsert(capture);
      }
    } catch {
      if (epoch !== hydrationEpoch) return;
      for (const id of batch) failedBookmarkIds.add(id);
    }
  }
}

export async function hydrateOfflineBodiesForPage(page: {
  feedItems: readonly ApplicationFeedItem[];
  bookmarks: readonly ApplicationBookmark[];
}) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const epoch = hydrationEpoch;
  // Hydration must not lengthen the page-application task it follows.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (epoch !== hydrationEpoch) return;
  const plan = planPageBodyHydration({
    feedItems: [...page.feedItems, ...takeFeedItemRetries()],
    bookmarks: [...page.bookmarks, ...takeBookmarkRetries()],
    hasRetainedFeedBody: (id) =>
      feedItemsStore.getState().retainedFeedItemBodyIds[id] === true,
    hasBookmarkCapture: (id) =>
      bookmarkCapturesStore.getState().capturesDict[id] !== undefined,
  });
  retainLoadedFeedItemBodies(plan.retainLoadedFeedItemIds);
  const fetchFeedItemIds = [...new Set(plan.fetchFeedItemIds)].filter(
    (id) => !unavailableFeedItemIds.has(id),
  );
  const fetchBookmarkIds = [...new Set(plan.fetchBookmarkIds)].filter(
    (id) => !unavailableBookmarkIds.has(id),
  );
  await Promise.all([
    hydrateFeedItemBodies(fetchFeedItemIds, epoch),
    hydrateBookmarkCaptures(fetchBookmarkIds, epoch),
  ]);
}
