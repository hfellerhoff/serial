import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import { bookmarkManifestValue } from "~/lib/data/bookmarks/manifest";

export function getFeedItemReconciliationVersion(item: ApplicationFeedItem) {
  return [
    item.contentHash ?? "",
    item.updatedAt.toISOString(),
    item.isWatchedUpdatedAt?.toISOString() ?? "",
    item.isWatchLaterUpdatedAt?.toISOString() ?? "",
    item.progress,
    item.duration,
  ].join("|");
}

export function getBookmarkReconciliationVersion(
  bookmark: ApplicationBookmark,
) {
  return bookmarkManifestValue(bookmark);
}
