export type RetainedCursorPage<T> = {
  key: string;
  requestCursorKey: string;
  nextCursorKey: string;
  entityIds: string[];
  value: T;
  byteSize: number;
  sequence: number;
};

export type PageRetentionBudget = {
  maxPages: number;
  maxBytes: number;
  navigationBufferPages: number;
};

export const CLIENT_PAGE_RETENTION_BUDGETS = {
  memory: {
    maxPages: 8,
    maxBytes: 8 * 1_024 * 1_024,
    navigationBufferPages: 2,
  },
  indexedDb: {
    maxPages: 6,
    maxBytes: 4 * 1_024 * 1_024,
    navigationBufferPages: 0,
  },
  mountedItems: 180,
} as const satisfies {
  memory: PageRetentionBudget;
  indexedDb: PageRetentionBudget;
  mountedItems: number;
};

type RetentionPins = {
  feedItemIds: Set<string>;
  bookmarkIds: Set<string>;
};

const pinsByOwner = new Map<string, RetentionPins>();

function sortedPages<T>(pages: Array<RetainedCursorPage<T>>) {
  return [...pages].sort(
    (left, right) =>
      left.sequence - right.sequence || left.key.localeCompare(right.key),
  );
}

export function getRetainedPageMetrics<T>(pages: Array<RetainedCursorPage<T>>) {
  const entityIds = new Set(pages.flatMap((page) => page.entityIds));
  return {
    pages: pages.length,
    entities: entityIds.size,
    bytes: pages.reduce((total, page) => total + page.byteSize, 0),
  };
}

export function enforcePageRetention<T>({
  pages,
  budget,
  pinnedEntityIds,
}: {
  pages: Array<RetainedCursorPage<T>>;
  budget: PageRetentionBudget;
  pinnedEntityIds: ReadonlySet<string>;
}) {
  const retained = sortedPages(pages);
  if (retained.length === 0) return retained;

  const protectedKeys = new Set(
    retained
      .slice(-Math.max(1, budget.navigationBufferPages + 1))
      .map((page) => page.key),
  );
  for (const page of retained) {
    if (page.entityIds.some((id) => pinnedEntityIds.has(id))) {
      protectedKeys.add(page.key);
    }
  }

  let metrics = getRetainedPageMetrics(retained);
  while (
    retained.length > 0 &&
    (metrics.pages > budget.maxPages || metrics.bytes > budget.maxBytes)
  ) {
    const evictionIndex = retained.findIndex(
      (page) => !protectedKeys.has(page.key),
    );
    if (evictionIndex < 0) break;
    retained.splice(evictionIndex, 1);
    metrics = getRetainedPageMetrics(retained);
  }

  return retained;
}

export function selectPersistedPages<T>(
  pages: Array<RetainedCursorPage<T>>,
  budget: PageRetentionBudget = CLIENT_PAGE_RETENTION_BUDGETS.indexedDb,
) {
  return enforcePageRetention({
    pages,
    budget,
    pinnedEntityIds: new Set<string>(),
  });
}

function normalizeForRetentionKey(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForRetentionKey);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalizeForRetentionKey(child)]),
    );
  }
  return value;
}

export function cursorRetentionKey(cursor: unknown) {
  return cursor == null
    ? "root"
    : JSON.stringify(normalizeForRetentionKey(cursor));
}

export function estimateRetainedBytes(value: unknown) {
  return new TextEncoder().encode(
    JSON.stringify(normalizeForRetentionKey(value)),
  ).byteLength;
}

export function getBoundedItemWindow({
  itemIds,
  renderEnd,
  selectedItemId,
  maxMountedItems = CLIENT_PAGE_RETENTION_BUDGETS.mountedItems,
}: {
  itemIds: string[];
  renderEnd: number;
  selectedItemId: string | null;
  maxMountedItems?: number;
}) {
  let end = Math.min(Math.max(renderEnd, 0), itemIds.length);
  let start = Math.max(0, end - maxMountedItems);
  const selectedIndex = selectedItemId ? itemIds.indexOf(selectedItemId) : -1;
  if (selectedIndex >= 0 && (selectedIndex < start || selectedIndex >= end)) {
    start = selectedIndex;
    end = Math.min(itemIds.length, start + maxMountedItems);
    start = Math.max(0, end - maxMountedItems);
  }
  return { start, end, itemIds: itemIds.slice(start, end) };
}

export function setRetainedEntityPins(
  owner: string,
  pins: {
    feedItemIds?: Iterable<string>;
    bookmarkIds?: Iterable<string>;
  },
) {
  pinsByOwner.set(owner, {
    feedItemIds: new Set(pins.feedItemIds),
    bookmarkIds: new Set(pins.bookmarkIds),
  });
}

export function clearRetainedEntityPins(owner: string) {
  pinsByOwner.delete(owner);
}

export function getRetainedEntityPins(kind: "feed-item" | "bookmark") {
  const ids = new Set<string>();
  for (const pins of pinsByOwner.values()) {
    const source = kind === "feed-item" ? pins.feedItemIds : pins.bookmarkIds;
    for (const id of source) ids.add(id);
  }
  return ids;
}
