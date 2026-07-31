import { bookmarksStore } from "./bookmarks/store";
import { feedItemsStore } from "./store";
import { mixedContentStore } from "./mixed-content/store";
import { viewsStore } from "./views/store";
import type { LoadedMixedScope } from "./mixed-content/store";
import type { PublishedChunk } from "~/server/api/publisher";
import type { BookmarkSyncBucketPage } from "~/server/mixed-content/sync";

const pendingBookmarkSyncBuckets = new Map<
  number,
  { version: string; bookmarks: BookmarkSyncBucketPage["bookmarks"] }
>();

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
  const feedPayloads = payloads.filter(
    (payload) => payload.source !== "bookmark" && payload.source !== "mixed",
  );
  if (feedPayloads.length > 0)
    feedItemsStore.getState().processChunks(feedPayloads);

  const bookmarkSyncPages = completeBookmarkSyncPages(payloads);
  bookmarksStore.getState().applySyncPages(bookmarkSyncPages);

  const affectedScopes = new Map<string, LoadedMixedScope>();
  for (const payload of payloads) {
    if (payload.source === "mixed") {
      const { chunk } = payload;
      bookmarksStore.getState().upsertMany(chunk.page.bookmarks);
      feedItemsStore.getState().setFeedItems(chunk.page.feedItems);
      mixedContentStore.getState().applyPage({
        scope: chunk.scope,
        visibility: chunk.visibility,
        page: chunk.page,
        replacesScope: chunk.replacesScope,
      });
      continue;
    }
    if (payload.source !== "bookmark") continue;
    const { chunk } = payload;
    if (chunk.type === "bookmark-sync-bucket") {
      continue;
    }
    if (chunk.type === "bookmark-upsert") {
      bookmarksStore.getState().upsert(chunk.bookmark);
      const affected = mixedContentStore.getState().reprojectUpsert({
        bookmark: chunk.bookmark,
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
    bookmarksStore.getState().remove(chunk.id);
    const affected = mixedContentStore.getState().reprojectDeletion(chunk.id);
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.visibility]),
        scope,
      );
    }
  }
  return [...affectedScopes.values()];
}
