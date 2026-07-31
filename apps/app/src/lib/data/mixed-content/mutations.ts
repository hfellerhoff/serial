import { setBulkWatchedValue } from "../feed-items/mutations";
import { bookmarksStore } from "../bookmarks/store";
import { feedItemsStore } from "../store";
import { viewsStore } from "../views/store";
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
  const targets = partitionMixedReadTargets(input.references);
  const previousBookmarks = targets.bookmarkIds
    .map((id) => bookmarksStore.getState().getBookmark(id))
    .filter((bookmark) => bookmark !== undefined);
  const now = new Date();

  for (const bookmark of previousBookmarks) {
    const optimisticBookmark = {
      ...bookmark,
      isRead: input.isRead,
      readUpdatedAt: now,
      updatedAt: now,
    };
    bookmarksStore.getState().upsert(optimisticBookmark);
    mixedContentStore.getState().reprojectUpsert({
      bookmark: optimisticBookmark,
      previousBookmark: bookmark,
      feedItems: feedItemsStore.getState().feedItemsDict,
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
    for (const bookmark of previousBookmarks) {
      const optimisticBookmark = bookmarksStore
        .getState()
        .getBookmark(bookmark.id);
      bookmarksStore.getState().upsert(bookmark);
      mixedContentStore.getState().reprojectUpsert({
        bookmark,
        previousBookmark: optimisticBookmark,
        feedItems: feedItemsStore.getState().feedItemsDict,
        views: viewsStore.getState().views,
      });
    }
    throw error;
  }

  return targets;
}
