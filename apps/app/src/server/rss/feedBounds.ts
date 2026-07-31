import type { RSSContent } from "./types";

export const MAX_PARSED_FEED_ITEMS = 200;
export const MAX_ITEM_CONTENT_BYTES = 256 * 1024;
export const MAX_ITEM_SNIPPET_BYTES = 32 * 1024;

function truncateUtf8(value: string | undefined, maxBytes: number) {
  if (!value) return value;
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return value;

  const truncated = new TextDecoder().decode(encoded.subarray(0, maxBytes));
  return truncated.endsWith("\uFFFD") ? truncated.slice(0, -1) : truncated;
}

export function boundFeedItems(items: RSSContent[]): RSSContent[] {
  return items.slice(0, MAX_PARSED_FEED_ITEMS).map((item) => ({
    ...item,
    content: truncateUtf8(item.content, MAX_ITEM_CONTENT_BYTES),
    contentSnippet: truncateUtf8(item.contentSnippet, MAX_ITEM_SNIPPET_BYTES),
  }));
}
