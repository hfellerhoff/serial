import { bookmarksStore } from "./bookmarks/store";
import { feedCategoriesStore } from "./feed-categories/store";
import { feedItemsStore } from "./store";
import { getMixedScopeKey, mixedContentStore } from "./mixed-content/store";
import { viewsStore } from "./views/store";
import { isBookmarkProjectionChange } from "./mixed-content/bookmarkProjection";
import { refreshNavigationSnapshotSafely } from "./navigation/store";
import type { LoadedMixedScope } from "./mixed-content/store";
import type { PublishedChunk } from "~/server/api/publisher";
import type { BookmarkSyncBucketPage } from "~/server/mixed-content/sync";

const pendingBookmarkSyncBuckets = new Map<
  number,
  { version: string; bookmarks: BookmarkSyncBucketPage["bookmarks"] }
>();

function incomingFeedItemIds(payloads: PublishedChunk[]) {
  const ids = new Set<string>();
  for (const payload of payloads) {
    if (payload.source === "bookmark" || payload.source === "mixed") continue;
    const chunk = payload.chunk;
    if ("feedItems" in chunk) {
      for (const item of chunk.feedItems) ids.add(item.id);
    }
    if ("items" in chunk) {
      for (const item of chunk.items) ids.add(item.id);
    }
    if ("diff" in chunk) {
      for (const entry of chunk.diff) {
        if (entry.status === "new" || entry.status === "updated") {
          ids.add(entry.item.id);
        }
      }
    }
  }
  return [...ids];
}

function completeBookmarkSyncPages(payloads: PublishedChunk[]) {
  const completed: BookmarkSyncBucketPage[] = [];
  for (const payload of payloads) {
    if (
      payload.source !== "bookmark" ||
      payload.chunk.type !== "bookmark-sync-bucket"
    ) {
      continue;
    }
    const page = payload.chunk;
    if (page.replacesBucket) {
      pendingBookmarkSyncBuckets.set(page.bucket, {
        version: page.version,
        bookmarks: [],
      });
    }
    const pending = pendingBookmarkSyncBuckets.get(page.bucket);
    if (!pending || pending.version !== page.version) continue;
    pending.bookmarks.push(...page.bookmarks);
    if (page.completesBucket) {
      completed.push({
        ...page,
        bookmarks: pending.bookmarks,
        replacesBucket: true,
        completesBucket: true,
      });
      pendingBookmarkSyncBuckets.delete(page.bucket);
    }
  }
  return completed;
}

export function processPublishedChunks(payloads: PublishedChunk[]) {
  const affectedScopes = new Map<string, LoadedMixedScope>();
  let navigationSnapshotChanged = false;
  const feedPayloads = payloads.filter(
    (payload) => payload.source !== "bookmark" && payload.source !== "mixed",
  );
  if (feedPayloads.length > 0) {
    const incomingItemIds = incomingFeedItemIds(feedPayloads);
    const previousFeedItems = Object.fromEntries(
      incomingItemIds.map((itemId) => [
        itemId,
        feedItemsStore.getState().feedItemsDict[itemId],
      ]),
    );
    feedItemsStore.getState().processChunks(feedPayloads);
    const affected = mixedContentStore.getState().reprojectFeedItems({
      itemIds: incomingItemIds,
      previousFeedItems,
      feedItems: feedItemsStore.getState().feedItemsDict,
      bookmarks: bookmarksStore.getState().snapshot(),
      views: viewsStore.getState().views,
      feedCategories: feedCategoriesStore.getState().feedCategories,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.visibility]),
        scope,
      );
    }
  }

  const bookmarkSyncPages = completeBookmarkSyncPages(payloads);
  const bookmarkSyncDelta = bookmarksStore
    .getState()
    .applySyncPages(bookmarkSyncPages);
  for (const { bookmark, previousBookmark } of bookmarkSyncDelta.upserts) {
    navigationSnapshotChanged ||= isBookmarkProjectionChange(
      previousBookmark,
      bookmark,
    );
    const affected = mixedContentStore.getState().reprojectUpsert({
      bookmark,
      previousBookmark,
      feedItems: feedItemsStore.getState().feedItemsDict,
      views: viewsStore.getState().views,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.visibility]),
        scope,
      );
    }
  }
  for (const bookmark of bookmarkSyncDelta.deletions) {
    navigationSnapshotChanged = true;
    const affected = mixedContentStore.getState().reprojectDeletion({
      bookmarkId: bookmark.id,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.visibility]),
        scope,
      );
    }
  }

  for (const payload of payloads) {
    if (payload.source === "mixed") {
      const { chunk } = payload;
      const scopeKey = getMixedScopeKey(chunk.scope, chunk.visibility);
      const requestCursor =
        chunk.replacesScope === true
          ? null
          : mixedContentStore.getState().scopes[scopeKey]?.cursor;
      bookmarksStore.getState().upsertMany(chunk.page.bookmarks);
      feedItemsStore.getState().setFeedItems(chunk.page.feedItems, {
        scopeKey: `mixed:${scopeKey}`,
        itemIds: chunk.page.feedItems.map((item) => item.id),
        requestCursor,
        nextCursor: chunk.page.cursor,
        replacesScope: chunk.replacesScope,
      });
      mixedContentStore.getState().applyPage({
        scope: chunk.scope,
        visibility: chunk.visibility,
        page: chunk.page,
        replacesScope: chunk.replacesScope,
        feedItems: feedItemsStore.getState().feedItemsDict,
      });
      continue;
    }
    if (payload.source !== "bookmark") continue;
    const { chunk } = payload;
    if (chunk.type === "bookmark-sync-bucket") {
      continue;
    }
    if (chunk.type === "bookmark-upsert") {
      const previousBookmark = bookmarksStore
        .getState()
        .getBookmark(chunk.bookmark.id);
      bookmarksStore.getState().upsert(chunk.bookmark);
      navigationSnapshotChanged ||= isBookmarkProjectionChange(
        previousBookmark,
        chunk.bookmark,
      );
      const affected = mixedContentStore.getState().reprojectUpsert({
        bookmark: chunk.bookmark,
        previousBookmark,
        feedItems: feedItemsStore.getState().feedItemsDict,
        views: viewsStore.getState().views,
      });
      for (const scope of affected) {
        affectedScopes.set(
          JSON.stringify([scope.scope, scope.visibility]),
          scope,
        );
      }
      continue;
    }
    if (chunk.type === "bookmark-upsert-batch") {
      const previousBookmarks = new Map(
        chunk.bookmarks.map((bookmark) => [
          bookmark.id,
          bookmarksStore.getState().getBookmark(bookmark.id),
        ]),
      );
      bookmarksStore.getState().upsertMany(chunk.bookmarks);
      for (const bookmark of chunk.bookmarks) {
        navigationSnapshotChanged ||= isBookmarkProjectionChange(
          previousBookmarks.get(bookmark.id),
          bookmark,
        );
        const affected = mixedContentStore.getState().reprojectUpsert({
          bookmark,
          previousBookmark: previousBookmarks.get(bookmark.id),
          feedItems: feedItemsStore.getState().feedItemsDict,
          views: viewsStore.getState().views,
        });
        for (const scope of affected) {
          affectedScopes.set(
            JSON.stringify([scope.scope, scope.visibility]),
            scope,
          );
        }
      }
      continue;
    }
    navigationSnapshotChanged = true;
    bookmarksStore.getState().remove(chunk.id);
    const affected = mixedContentStore.getState().reprojectDeletion({
      bookmarkId: chunk.id,
      feedItems: feedItemsStore.getState().feedItemsDict,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.visibility]),
        scope,
      );
    }
  }
  if (navigationSnapshotChanged) {
    void refreshNavigationSnapshotSafely();
  }
  return [...affectedScopes.values()];
}
