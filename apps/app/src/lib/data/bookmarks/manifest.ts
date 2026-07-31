import type { ApplicationBookmark } from "~/server/mixed-content/projection";

export function bookmarkManifestValue(bookmark: ApplicationBookmark) {
  return [
    bookmark.updatedAt.toISOString(),
    bookmark.savedUpdatedAt.toISOString(),
    bookmark.readUpdatedAt.toISOString(),
    bookmark.progressUpdatedAt.toISOString(),
    bookmark.captureHash ?? "",
    bookmark.capturedAt?.toISOString() ?? "",
    bookmark.viewIds.join(","),
    bookmark.tagIds.join(","),
  ].join("|");
}
