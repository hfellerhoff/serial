import type { ApplicationFeedItem } from "~/server/db/schema";

export type IncomingFeedItem = Omit<ApplicationFeedItem, "content"> &
  Partial<Pick<ApplicationFeedItem, "content">>;

const FEED_ITEM_MERGE_FIELDS = {
  metadata: [
    "isWatched",
    "isWatchedUpdatedAt",
    "isWatchLater",
    "isWatchLaterUpdatedAt",
    "progress",
    "duration",
    "updatedAt",
  ],
} as const satisfies {
  metadata: ReadonlyArray<keyof ApplicationFeedItem>;
};

function normalizeIncomingFeedItem(
  incomingItem: IncomingFeedItem,
): ApplicationFeedItem {
  return {
    ...incomingItem,
    content: incomingItem.content ?? "",
  } as ApplicationFeedItem;
}

function hasMatchingContentHash(
  existingItem: ApplicationFeedItem | undefined,
  incomingItem: IncomingFeedItem,
) {
  return (
    !!existingItem?.contentHash &&
    !!incomingItem.contentHash &&
    existingItem.contentHash === incomingItem.contentHash
  );
}

function mergeItemMetadata(
  baseItem: ApplicationFeedItem,
  incomingItem: IncomingFeedItem,
) {
  const mergedItem = { ...baseItem };

  for (const field of FEED_ITEM_MERGE_FIELDS.metadata) {
    mergedItem[field] = incomingItem[field] as never;
  }

  return mergedItem;
}

export function mergeFeedItem(
  existingItem: ApplicationFeedItem | undefined,
  incomingItem: IncomingFeedItem,
): ApplicationFeedItem {
  const normalizedIncomingItem = normalizeIncomingFeedItem(incomingItem);

  if (!existingItem) {
    return normalizedIncomingItem;
  }

  if (!hasMatchingContentHash(existingItem, incomingItem)) {
    return normalizedIncomingItem;
  }

  return mergeItemMetadata(
    {
      ...existingItem,
      content: existingItem.content || normalizedIncomingItem.content,
      contentSnippet:
        existingItem.contentSnippet || normalizedIncomingItem.contentSnippet,
    },
    incomingItem,
  );
}
