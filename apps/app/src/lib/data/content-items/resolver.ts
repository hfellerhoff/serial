import type { ApplicationFeedItem } from "~/server/db/schema";
import type { ApplicationBookmark } from "~/server/mixed-content/projection";
import {
  getNativeOpeningBehavior,
  getOriginActionLabel,
} from "~/lib/content/capabilities";
import { isValidNativeContentId } from "~/lib/content/classification";

export type ContentItem =
  | { entityKind: "feed-item"; entity: ApplicationFeedItem }
  | { entityKind: "bookmark"; entity: ApplicationBookmark };

export type ContentItemResolution =
  | { status: "resolved"; item: ContentItem }
  | { status: "missing" }
  | { status: "ambiguous" };

export function resolveContentItem(input: {
  feedItem?: ApplicationFeedItem;
  bookmark?: ApplicationBookmark;
}): ContentItemResolution {
  if (input.feedItem && input.bookmark) return { status: "ambiguous" };
  if (input.bookmark) {
    return {
      status: "resolved",
      item: { entityKind: "bookmark", entity: input.bookmark },
    };
  }
  if (input.feedItem) {
    return {
      status: "resolved",
      item: { entityKind: "feed-item", entity: input.feedItem },
    };
  }
  return { status: "missing" };
}

export type ContentRenderer = "read" | "watch" | "origin";

export function supportedContentRenderer(item: ContentItem): ContentRenderer {
  const behavior = getNativeOpeningBehavior(item.entity);
  if (behavior === "reader") {
    return item.entityKind === "feed-item" || item.entity.captureHash
      ? "read"
      : "origin";
  }
  if (behavior === "player") {
    return isValidNativeContentId(item.entity.platform, item.entity.contentId)
      ? "watch"
      : "origin";
  }
  return "origin";
}

export function contentOriginalUrl(item: ContentItem) {
  return item.entityKind === "bookmark"
    ? item.entity.sourceUrl
    : item.entity.url;
}

export function contentDestination(item: ContentItem) {
  const renderer = supportedContentRenderer(item);
  return renderer === "origin"
    ? {
        renderer,
        href: contentOriginalUrl(item),
        external: true as const,
        actionLabel: getOriginActionLabel(item.entity),
      }
    : {
        renderer,
        href: `/${renderer}/${item.entity.id}`,
        external: false as const,
      };
}
