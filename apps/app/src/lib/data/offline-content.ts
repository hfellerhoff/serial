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
    return nextItem.content ? { ...nextItem, content: "" } : nextItem;
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
