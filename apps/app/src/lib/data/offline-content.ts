import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import type { ConnectionState } from "./atoms";

export function isEligibleFeedBody(
  item: Pick<ApplicationFeedItem, "content" | "contentType" | "isWatched">,
) {
  return (
    item.contentType === "text" &&
    !item.isWatched &&
    item.content.trim().length > 0
  );
}

export function hasRetainedFeedBody(
  item: Pick<ApplicationFeedItem, "content" | "contentType" | "isWatched">,
  isRetained: boolean,
) {
  return isRetained && isEligibleFeedBody(item);
}

export function retainEligibleFeedBody(
  previousItem: ApplicationFeedItem | undefined,
  nextItem: ApplicationFeedItem,
) {
  if (nextItem.contentType !== "text" || nextItem.isWatched) {
    return nextItem;
  }
  if (
    !nextItem.content &&
    previousItem?.contentHash &&
    previousItem.contentHash === nextItem.contentHash &&
    isEligibleFeedBody(previousItem)
  ) {
    return {
      ...nextItem,
      content: previousItem.content,
      contentSnippet: nextItem.contentSnippet || previousItem.contentSnippet,
    };
  }
  return nextItem;
}

// Memoized per entity object so repeated persistence flushes hand the
// normalized IDB diff a stable stripped identity instead of a fresh clone.
const strippedBodiesForPersistence = new WeakMap<
  ApplicationFeedItem,
  ApplicationFeedItem
>();

/**
 * Archived and video bodies must not survive in client persistence. The live
 * store keeps them so the online reader can render without a refetch; only
 * the persisted snapshot is stripped.
 */
export function stripIneligibleFeedBodyForPersistence(
  item: ApplicationFeedItem,
) {
  if (isEligibleFeedBody(item) || !item.content) return item;
  let stripped = strippedBodiesForPersistence.get(item);
  if (!stripped) {
    stripped = { ...item, content: "" };
    strippedBodiesForPersistence.set(item, stripped);
  }
  return stripped;
}

export function shouldRetainBookmarkCapture(
  bookmark: Pick<ApplicationBookmark, "contentType" | "isRead">,
) {
  return bookmark.contentType === "text" && !bookmark.isRead;
}

export function canOpenOfflineContent(input: {
  contentType: "text" | "video";
  hasBody: boolean;
}) {
  return input.contentType === "text" && input.hasBody;
}

export function canOpenContent(input: {
  connectionState: ConnectionState;
  contentType: "text" | "video";
  hasBody: boolean;
}) {
  return (
    input.connectionState !== "disconnected" || canOpenOfflineContent(input)
  );
}
