import type { ApplicationFeedItem } from "~/server/db/schema";
import {
  clearRetainedEntityPins,
  setRetainedEntityPins,
} from "~/lib/data/page-retention";

type PendingFieldOverride<T> = {
  token: object;
  value: T;
  updatedAt: Date | null;
};

type PendingFeedItemOverrides = {
  isWatched?: PendingFieldOverride<boolean>;
  isWatchLater?: PendingFieldOverride<boolean>;
};

const pendingFeedItemOverrides = new Map<string, PendingFeedItemOverrides>();

function setPendingFieldOverride<T>(
  itemId: string,
  field: keyof PendingFeedItemOverrides,
  value: T,
  updatedAt: Date | null,
) {
  const token = {};
  pendingFeedItemOverrides.set(itemId, {
    ...pendingFeedItemOverrides.get(itemId),
    [field]: { token, value, updatedAt },
  });
  setRetainedEntityPins(`optimistic:feed-item:${itemId}`, {
    feedItemIds: [itemId],
  });
  return token;
}

export function setPendingWatchedOverride(
  itemId: string,
  isWatched: boolean,
  isWatchedUpdatedAt: Date | null,
) {
  return setPendingFieldOverride(
    itemId,
    "isWatched",
    isWatched,
    isWatchedUpdatedAt,
  );
}

export function setPendingWatchLaterOverride(
  itemId: string,
  isWatchLater: boolean,
  isWatchLaterUpdatedAt: Date,
) {
  return setPendingFieldOverride(
    itemId,
    "isWatchLater",
    isWatchLater,
    isWatchLaterUpdatedAt,
  );
}

export function clearPendingFeedItemOverride(
  itemId: string,
  field: keyof PendingFeedItemOverrides,
  token: object,
) {
  const overrides = pendingFeedItemOverrides.get(itemId);
  if (overrides?.[field]?.token !== token) return false;

  const nextOverrides = { ...overrides };
  delete nextOverrides[field];

  if (Object.keys(nextOverrides).length === 0) {
    pendingFeedItemOverrides.delete(itemId);
    clearRetainedEntityPins(`optimistic:feed-item:${itemId}`);
  } else {
    pendingFeedItemOverrides.set(itemId, nextOverrides);
  }

  return true;
}

export function applyPendingFeedItemOverrides(item: ApplicationFeedItem) {
  const overrides = pendingFeedItemOverrides.get(item.id);
  if (!overrides) return item;

  return {
    ...item,
    ...(overrides.isWatched
      ? {
          isWatched: overrides.isWatched.value,
          isWatchedUpdatedAt: overrides.isWatched.updatedAt,
        }
      : {}),
    ...(overrides.isWatchLater
      ? {
          isWatchLater: overrides.isWatchLater.value,
          isWatchLaterUpdatedAt: overrides.isWatchLater.updatedAt,
        }
      : {}),
  };
}

export function clearPendingFeedItemOverrides() {
  for (const itemId of pendingFeedItemOverrides.keys()) {
    clearRetainedEntityPins(`optimistic:feed-item:${itemId}`);
  }
  pendingFeedItemOverrides.clear();
}
