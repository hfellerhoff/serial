import { bookmarksStore } from "./bookmarks/store";
import { feedItemsStore } from "./store";
import { mixedContentStore } from "./mixed-content/store";
import { viewsStore } from "./views/store";
import type { LoadedMixedScope } from "./mixed-content/store";
import type { PublishedChunk } from "~/server/api/publisher";

export function processPublishedChunks(payloads: PublishedChunk[]) {
  const feedPayloads = payloads.filter(
    (payload) => payload.source !== "bookmark" && payload.source !== "mixed",
  );
  if (feedPayloads.length > 0)
    feedItemsStore.getState().processChunks(feedPayloads);

  const affectedScopes = new Map<string, LoadedMixedScope>();
  for (const payload of payloads) {
    if (payload.source === "mixed") {
      const { chunk } = payload;
      for (const bookmark of chunk.page.bookmarks) {
        bookmarksStore.getState().upsert(bookmark);
      }
      for (const item of chunk.page.feedItems) {
        feedItemsStore.getState().setFeedItem(item.id, item);
      }
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
    if (chunk.type === "bookmark-diff") {
      bookmarksStore.getState().applyDiff(chunk.diff);
      continue;
    }
    if (chunk.type === "bookmark-upsert") {
      const previousBookmark = bookmarksStore
        .getState()
        .getBookmark(chunk.bookmark.id);
      bookmarksStore.getState().upsert(chunk.bookmark);
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
  return [...affectedScopes.values()];
}
