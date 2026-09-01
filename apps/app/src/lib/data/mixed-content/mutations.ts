import { setBulkWatchedValue } from "../feed-items/mutations";
import { bookmarksStore } from "../bookmarks/store";
import { feedItemsStore } from "../store";
import { viewsStore } from "../views/store";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "../page-retention";
import { canMutateNow } from "../offline-mutations";
import { isBookmarkProjectionChange } from "./bookmarkProjection";
import { advanceMixedContentMembershipRevision } from "./membershipRevision";
import { mixedContentStore } from "./store";
import type { MixedContentReference } from "~/server/mixed-content/projection";
import { orpcRouterClient } from "~/lib/orpc";

export function partitionMixedReadTargets(references: MixedContentReference[]) {
  return references.reduce(
    (targets, reference) => {
      if (reference.entityKind === "bookmark") {
        targets.bookmarkIds.push(reference.entityId);
        return targets;
      }
      const item = feedItemsStore.getState().feedItemsDict[reference.entityId];
      if (item) targets.feedItems.push({ id: item.id, feedId: item.feedId });
      return targets;
    },
    {
      bookmarkIds: [] as string[],
      feedItems: [] as Array<{ id: string; feedId: number }>,
    },
  );
}

export async function setMixedReadValue(input: {
  references: MixedContentReference[];
  isRead: boolean;
}) {
  if (!canMutateNow()) {
    return { bookmarkIds: [], feedItems: [] };
  }
  const targets = partitionMixedReadTargets(input.references);
  const previousBookmarks = targets.bookmarkIds
    .map((id) => bookmarksStore.getState().getBookmark(id))
    .filter((bookmark) => bookmark !== undefined);
  const now = new Date();
  const optimisticBookmarks = previousBookmarks.map((bookmark) => ({
    ...bookmark,
    isRead: input.isRead,
    readUpdatedAt: now,
    updatedAt: now,
  }));

  for (const bookmarkId of targets.bookmarkIds) {
    setRetainedEntityPins(`optimistic:bookmark:${bookmarkId}`, {
      bookmarkIds: [bookmarkId],
    });
  }

  if (
    optimisticBookmarks.some((bookmark, index) =>
      isBookmarkProjectionChange(previousBookmarks[index], bookmark),
    )
  ) {
    advanceMixedContentMembershipRevision();
  }

  for (const [index, bookmark] of previousBookmarks.entries()) {
    const optimisticBookmark = optimisticBookmarks[index]!;
    bookmarksStore.getState().upsert(optimisticBookmark);
    mixedContentStore.getState().reprojectUpsert({
      bookmark: optimisticBookmark,
      previousBookmark: bookmark,
      views: viewsStore.getState().views,
    });
  }

  try {
    await Promise.all([
      targets.bookmarkIds.length > 0
        ? orpcRouterClient.bookmark.setBulkReadValue({
            bookmarkIds: targets.bookmarkIds,
            isRead: input.isRead,
          })
        : Promise.resolve([]),
      targets.feedItems.length > 0
        ? setBulkWatchedValue({
            items: targets.feedItems,
            isWatched: input.isRead,
          })
        : Promise.resolve(),
    ]);
  } catch (error) {
    if (
      previousBookmarks.some((bookmark) =>
        isBookmarkProjectionChange(
          bookmarksStore.getState().getBookmark(bookmark.id),
          bookmark,
        ),
      )
    ) {
      advanceMixedContentMembershipRevision();
    }
    for (const bookmark of previousBookmarks) {
      const optimisticBookmark = bookmarksStore
        .getState()
        .getBookmark(bookmark.id);
      bookmarksStore.getState().upsert(bookmark);
      mixedContentStore.getState().reprojectUpsert({
        bookmark,
        previousBookmark: optimisticBookmark,
        views: viewsStore.getState().views,
      });
    }
    throw error;
  } finally {
    for (const bookmarkId of targets.bookmarkIds) {
      clearRetainedEntityPins(`optimistic:bookmark:${bookmarkId}`);
    }
  }

  return targets;
}
