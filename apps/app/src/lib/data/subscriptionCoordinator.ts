import { bookmarksStore } from "./bookmarks/store";
import { feedCategoriesStore } from "./feed-categories/store";
import { feedItemsStore } from "./store";
import {
  getMixedScopeKey,
  hasBookmarkBodyOwner,
  mixedContentStore,
} from "./mixed-content/store";
import { viewsStore } from "./views/store";
import { isBookmarkProjectionChange } from "./mixed-content/bookmarkProjection";
import { advanceMixedContentMembershipRevision } from "./mixed-content/membershipRevision";
import { refreshNavigationSnapshotSafely } from "./navigation/store";
import { hydrateOfflineBodiesForPage } from "./offline-hydration";
import { hasFeedItemListProjectionChanged } from "./feed-items/listProjection";
import type { LoadedMixedScope } from "./mixed-content/store";
import type { PublishedChunk } from "~/server/api/publisher";
import type {
  MixedContentPage,
  MixedContentScope,
} from "~/server/mixed-content/projection";
import type { ContentStatusFilter } from "~/lib/content-status";

function incomingFeedItemIds(payloads: PublishedChunk[]) {
  const ids = new Set<string>();
  for (const payload of payloads) {
    if (payload.source !== "rss") continue;
    const chunk = payload.chunk;
    if (chunk.type === "feed-items") {
      for (const item of chunk.feedItems) ids.add(item.id);
    }
  }
  return [...ids];
}

export function applyRequestedMixedContentPage(input: {
  scope: MixedContentScope;
  contentStatus: ContentStatusFilter;
  page: MixedContentPage;
  replacesScope: boolean;
}) {
  const scopeKey = getMixedScopeKey(input.scope, input.contentStatus);
  const requestCursor = input.replacesScope
    ? null
    : mixedContentStore.getState().scopes[scopeKey]?.cursor;
  bookmarksStore.getState().upsertMany(input.page.bookmarks);
  feedItemsStore.getState().setFeedItems(input.page.feedItems, {
    scopeKey: `mixed:${scopeKey}`,
    itemIds: input.page.feedItems.map((item) => item.id),
    requestCursor,
    nextCursor: input.page.cursor,
    replacesScope: input.replacesScope,
  });
  mixedContentStore.getState().applyPage(input);
  void hydrateOfflineBodiesForPage(input.page);
}

export function applyPublishedChunks(
  payloads: PublishedChunk[],
  options: { refreshNavigation?: boolean } = {},
) {
  const affectedScopes = new Map<string, LoadedMixedScope>();
  let bookmarkProjectionChanged = false;
  let navigationSnapshotChanged = payloads.some(
    ({ chunk }) =>
      "refreshNavigationSnapshot" in chunk &&
      chunk.refreshNavigationSnapshot === true,
  );
  const feedPayloads = payloads.filter(
    (payload) =>
      payload.source !== "bookmark" && payload.source !== "invalidation",
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
    for (const itemId of incomingItemIds) {
      const item = feedItemsStore.getState().feedItemsDict[itemId];
      if (item) {
        navigationSnapshotChanged ||= hasFeedItemListProjectionChanged(
          previousFeedItems[itemId],
          item,
        );
      }
    }
    const affected = mixedContentStore.getState().reprojectFeedItems({
      itemIds: incomingItemIds,
      previousFeedItems,
      feedItems: feedItemsStore.getState().feedItemsDict,
      views: viewsStore.getState().views,
      feedCategories: feedCategoriesStore.getState().feedCategories,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.contentStatus]),
        scope,
      );
    }
  }

  for (const payload of payloads) {
    if (payload.source === "invalidation") continue;
    if (payload.source !== "bookmark") continue;
    const { chunk } = payload;
    if (chunk.type === "bookmark-upsert") {
      if (
        !hasBookmarkBodyOwner(chunk.bookmark.id) &&
        chunk.affectsListProjection === false
      ) {
        continue;
      }
      const previousBookmark = bookmarksStore
        .getState()
        .getBookmark(chunk.bookmark.id);
      const projectionChanged = isBookmarkProjectionChange(
        previousBookmark,
        chunk.bookmark,
      );
      bookmarkProjectionChanged ||=
        chunk.affectsListProjection !== false && projectionChanged;
      bookmarksStore.getState().upsert(chunk.bookmark);
      navigationSnapshotChanged ||= projectionChanged;
      const affected = mixedContentStore.getState().reprojectUpsert({
        bookmark: chunk.bookmark,
        previousBookmark,
        views: viewsStore.getState().views,
      });
      for (const scope of affected) {
        affectedScopes.set(
          JSON.stringify([scope.scope, scope.contentStatus]),
          scope,
        );
      }
      continue;
    }
    if (chunk.type === "bookmark-upsert-batch") {
      const retainedBookmarks = chunk.bookmarks.filter((bookmark) =>
        hasBookmarkBodyOwner(bookmark.id),
      );
      const previousBookmarks = new Map(
        retainedBookmarks.map((bookmark) => [
          bookmark.id,
          bookmarksStore.getState().getBookmark(bookmark.id),
        ]),
      );
      bookmarkProjectionChanged ||=
        retainedBookmarks.length < chunk.bookmarks.length ||
        retainedBookmarks.some((bookmark) =>
          isBookmarkProjectionChange(
            previousBookmarks.get(bookmark.id),
            bookmark,
          ),
        );
      bookmarksStore.getState().upsertMany(retainedBookmarks);
      for (const bookmark of retainedBookmarks) {
        navigationSnapshotChanged ||= isBookmarkProjectionChange(
          previousBookmarks.get(bookmark.id),
          bookmark,
        );
        const affected = mixedContentStore.getState().reprojectUpsert({
          bookmark,
          previousBookmark: previousBookmarks.get(bookmark.id),
          views: viewsStore.getState().views,
        });
        for (const scope of affected) {
          affectedScopes.set(
            JSON.stringify([scope.scope, scope.contentStatus]),
            scope,
          );
        }
      }
      continue;
    }
    bookmarkProjectionChanged = true;
    navigationSnapshotChanged = true;
    bookmarksStore.getState().remove(chunk.id);
    const affected = mixedContentStore.getState().reprojectDeletion({
      bookmarkId: chunk.id,
    });
    for (const scope of affected) {
      affectedScopes.set(
        JSON.stringify([scope.scope, scope.contentStatus]),
        scope,
      );
    }
  }
  if (bookmarkProjectionChanged) {
    advanceMixedContentMembershipRevision();
  }
  if (navigationSnapshotChanged && options.refreshNavigation !== false) {
    void refreshNavigationSnapshotSafely();
  }
  return {
    affectedScopes: [...affectedScopes.values()],
    navigationSnapshotChanged,
  };
}

export function processPublishedChunks(
  payloads: PublishedChunk[],
  options: { refreshNavigation?: boolean } = {},
) {
  return applyPublishedChunks(payloads, options).affectedScopes;
}
