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
// succeeded without yielding content are recorded with the content hash they
// were fetched under: they must not be re-requested on every page
// application, but a changed hash means new server content and unblocks them.
const failedFeedItemIds = new Set<string>();
const failedBookmarkIds = new Set<string>();
const unavailableFeedBodies = new Map<string, string | null>();
const unavailableCaptures = new Map<string, string | null>();

// Bumped on sign-out so an in-flight response cannot repopulate cleared
// stores (and, through their persistence, IndexedDB) with the previous
// user's content.
let hydrationEpoch = 0;

// A hydration request that hangs rather than rejecting (dropped mobile
// radio) must not gate the single-flight run for the browser's own
// multi-minute fetch timeout.
const HYDRATION_REQUEST_TIMEOUT_MS = 30_000;

// Page applications coalesce into one hydration run: the retry sets are
// session-scoped, so concurrent runs would each sweep the whole failed set.
// Pending entities are keyed by id so repeated applications of the same page
// while a run is gated cannot grow the buffer.
const pendingFeedItems = new Map<string, ApplicationFeedItem>();
const pendingBookmarks = new Map<string, ApplicationBookmark>();
let pendingRun = false;
let activeHydration: Promise<void> | null = null;

export function invalidateOfflineHydration() {
  hydrationEpoch += 1;
  failedFeedItemIds.clear();
  failedBookmarkIds.clear();
  unavailableFeedBodies.clear();
  unavailableCaptures.clear();
  pendingFeedItems.clear();
  pendingBookmarks.clear();
  pendingRun = false;
  // Sever the previous session's run: it exits on its cleared pendingRun
  // flag, and its own finally must not null out a newer session's run.
  activeHydration = null;
}

// Macrotask yield through a MessageChannel rather than setTimeout: the
// single-flight run must survive mocked timers, and a message task defers
// off the page-application task just the same.
function yieldToNextTask() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
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

// Blocked while the server-side hash matches the one the empty fetch saw; a
// changed hash means regenerated content, so the block lifts. A permanently
// blocked id also leaves the retry set so it cannot linger there.
function filterUnavailable(
  ids: string[],
  unavailable: Map<string, string | null>,
  failed: Set<string>,
  currentHash: (id: string) => string | null,
) {
  return [...new Set(ids)].filter((id) => {
    if (!unavailable.has(id)) return true;
    if (unavailable.get(id) === currentHash(id)) {
      failed.delete(id);
      return false;
    }
    unavailable.delete(id);
    return true;
  });
}

async function hydrateFeedItemBodies(itemIds: string[], epoch: number) {
  for (let index = 0; index < itemIds.length; index += FULLTEXT_BATCH_SIZE) {
    const batch = itemIds.slice(index, index + FULLTEXT_BATCH_SIZE);
    try {
      const items = await orpcRouterClient.initial.requestFullTextForItems(
        { itemIds: batch },
        { signal: AbortSignal.timeout(HYDRATION_REQUEST_TIMEOUT_MS) },
      );
      if (epoch !== hydrationEpoch) return;
      const returnedById = new Map(items.map((item) => [item.id, item]));
      for (const id of batch) {
        failedFeedItemIds.delete(id);
        if (!returnedById.get(id)?.content.trim()) {
          unavailableFeedBodies.set(
            id,
            feedItemsStore.getState().feedItemsDict[id]?.contentHash ?? null,
          );
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
      const captures = await orpcRouterClient.bookmark.getCaptures(
        { bookmarkIds: batch },
        { signal: AbortSignal.timeout(HYDRATION_REQUEST_TIMEOUT_MS) },
      );
      if (epoch !== hydrationEpoch) return;
      const returnedIds = new Set(
        captures.map((capture) => capture.bookmarkId),
      );
      for (const id of batch) {
        failedBookmarkIds.delete(id);
        if (!returnedIds.has(id)) {
          unavailableCaptures.set(
            id,
            bookmarksStore.getState().getBookmark(id)?.captureHash ?? null,
          );
        }
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

async function hydratePendingEntities(page: {
  feedItems: readonly ApplicationFeedItem[];
  bookmarks: readonly ApplicationBookmark[];
}) {
  const epoch = hydrationEpoch;
  // Hydration must not lengthen the page-application task it follows.
  await yieldToNextTask();
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
  const fetchFeedItemIds = filterUnavailable(
    plan.fetchFeedItemIds,
    unavailableFeedBodies,
    failedFeedItemIds,
    (id) => feedItemsStore.getState().feedItemsDict[id]?.contentHash ?? null,
  );
  const fetchBookmarkIds = filterUnavailable(
    plan.fetchBookmarkIds,
    unavailableCaptures,
    failedBookmarkIds,
    (id) => bookmarksStore.getState().getBookmark(id)?.captureHash ?? null,
  );
  await Promise.all([
    hydrateFeedItemBodies(fetchFeedItemIds, epoch),
    hydrateBookmarkCaptures(fetchBookmarkIds, epoch),
  ]);
}

export function hydrateOfflineBodiesForPage(page: {
  feedItems: readonly ApplicationFeedItem[];
  bookmarks: readonly ApplicationBookmark[];
}): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve();
  }
  for (const item of page.feedItems) pendingFeedItems.set(item.id, item);
  for (const bookmark of page.bookmarks) {
    pendingBookmarks.set(bookmark.id, bookmark);
  }
  // Even an entity-less page application sweeps once so failed fetches
  // retry; without this the active target's `unchanged` diffs would never
  // trigger a retry.
  pendingRun = true;
  if (activeHydration) return activeHydration;
  const startEpoch = hydrationEpoch;
  activeHydration = (async () => {
    try {
      while (pendingRun) {
        pendingRun = false;
        const feedItems = [...pendingFeedItems.values()];
        const bookmarks = [...pendingBookmarks.values()];
        pendingFeedItems.clear();
        pendingBookmarks.clear();
        await hydratePendingEntities({ feedItems, bookmarks });
      }
    } finally {
      // An unchanged epoch proves this run is still the admitted one; a
      // bumped epoch means invalidation severed it and may have admitted a
      // newer run that must not be nulled out.
      if (hydrationEpoch === startEpoch) activeHydration = null;
    }
  })();
  return activeHydration;
}
