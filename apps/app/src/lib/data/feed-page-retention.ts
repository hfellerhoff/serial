import {
  CLIENT_PAGE_RETENTION_BUDGETS,
  cursorRetentionKey,
  enforcePageRetention,
  estimateRetainedBytes,
  getRetainedEntityPins,
  getRetainedPageMetrics,
  selectPersistedPages,
} from "./page-retention";
import {
  hasRetainedFeedBody,
  stripIneligibleFeedBodyForPersistence,
} from "./offline-content";
import type { RetainedCursorPage } from "./page-retention";
import type { ApplicationFeedItem } from "~/server/db/schema";

type RetainedFeedPageValue = {
  itemIds: string[];
};

export type RetainedFeedPage = RetainedCursorPage<RetainedFeedPageValue>;

export type RetainFeedItemPageInput = {
  scopeKey: string;
  itemIds: string[];
  requestCursor: unknown;
  nextCursor: unknown;
  replacesScope: boolean;
};

export type FeedPageRetentionState = {
  feedItemsDict: Record<string, ApplicationFeedItem>;
  feedItemsOrder: string[];
  scopeFeedItemIds: Record<string, string[]>;
  retainedFeedPages: Record<string, RetainedFeedPage[]>;
  retainedFeedPageBytes: number;
  pageOwnedFeedItemIds: Record<string, true>;
  retainedFeedItemBodyIds: Record<string, true>;
};

function retainedPageBytes(
  retainedFeedPages: Record<string, RetainedFeedPage[]>,
) {
  return Object.values(retainedFeedPages).reduce(
    (total, pages) => total + getRetainedPageMetrics(pages).bytes,
    0,
  );
}

export function applyFeedItemPageRetention(
  state: FeedPageRetentionState,
  {
    scopeKey,
    itemIds,
    requestCursor,
    nextCursor,
    replacesScope,
  }: RetainFeedItemPageInput,
): FeedPageRetentionState {
  const sourcePages = replacesScope
    ? []
    : (state.retainedFeedPages[scopeKey] ?? []);
  const requestCursorKey = cursorRetentionKey(requestCursor);
  const nextCursorKey = cursorRetentionKey(nextCursor);
  const key = `${requestCursorKey}->${nextCursorKey}`;
  const existingIndex = sourcePages.findIndex((page) => page.key === key);
  const existingPage =
    existingIndex >= 0 ? sourcePages[existingIndex] : undefined;
  const mergedItemIds = [
    ...new Set([...(existingPage?.value.itemIds ?? []), ...itemIds]),
  ];
  const value = { itemIds: mergedItemIds };
  const page: RetainedFeedPage = {
    key,
    requestCursorKey,
    nextCursorKey,
    entityIds: mergedItemIds,
    value,
    byteSize: estimateRetainedBytes(
      mergedItemIds.flatMap((id) => {
        const item = state.feedItemsDict[id];
        return item ? [item] : [];
      }),
    ),
    sequence:
      existingPage?.sequence ??
      Math.max(-1, ...sourcePages.map((candidate) => candidate.sequence)) + 1,
  };
  const candidatePages = [...sourcePages];
  if (existingIndex >= 0) {
    candidatePages[existingIndex] = page;
  } else {
    candidatePages.push(page);
  }
  const pinnedEntityIds = getRetainedEntityPins("feed-item");
  const pages = enforcePageRetention({
    pages: candidatePages,
    budget: CLIENT_PAGE_RETENTION_BUDGETS.memory,
    pinnedEntityIds,
  });
  const retainedFeedPages = {
    ...state.retainedFeedPages,
    [scopeKey]: pages,
  };
  const retainedEntityIds = new Set(
    Object.values(retainedFeedPages).flatMap((scopePages) =>
      scopePages.flatMap((candidate) => candidate.entityIds),
    ),
  );
  const pageOwnedFeedItemIds = { ...state.pageOwnedFeedItemIds };
  for (const id of itemIds) pageOwnedFeedItemIds[id] = true;

  const feedItemsDict = { ...state.feedItemsDict };
  for (const id of Object.keys(pageOwnedFeedItemIds)) {
    const item = feedItemsDict[id];
    if (
      retainedEntityIds.has(id) ||
      pinnedEntityIds.has(id) ||
      (item &&
        hasRetainedFeedBody(item, state.retainedFeedItemBodyIds[id] === true))
    ) {
      continue;
    }
    delete feedItemsDict[id];
    delete pageOwnedFeedItemIds[id];
  }
  const existingScopeIds = replacesScope
    ? []
    : (state.scopeFeedItemIds[scopeKey] ?? []);
  const targetScopeIds = [...new Set([...existingScopeIds, ...itemIds])];
  const scopeFeedItemIds = Object.fromEntries(
    Object.entries({
      ...state.scopeFeedItemIds,
      [scopeKey]: targetScopeIds,
    }).map(([candidateScopeKey, ids]) => [
      candidateScopeKey,
      ids.filter((id) => feedItemsDict[id] !== undefined),
    ]),
  );
  return {
    retainedFeedPages,
    retainedFeedPageBytes: retainedPageBytes(retainedFeedPages),
    pageOwnedFeedItemIds,
    feedItemsDict,
    feedItemsOrder: state.feedItemsOrder.filter(
      (id) => feedItemsDict[id] !== undefined,
    ),
    scopeFeedItemIds,
    retainedFeedItemBodyIds: Object.fromEntries(
      Object.keys(state.retainedFeedItemBodyIds)
        .filter((id) => feedItemsDict[id] !== undefined)
        .map((id) => [id, true as const]),
    ),
  };
}

export function getPersistedFeedItemRetentionState(
  state: FeedPageRetentionState,
): FeedPageRetentionState {
  const retainedFeedPages = Object.fromEntries(
    Object.entries(state.retainedFeedPages).map(([scopeKey, pages]) => [
      scopeKey,
      selectPersistedPages(pages),
    ]),
  );
  const persistedPageEntityIds = new Set(
    Object.values(retainedFeedPages).flatMap((pages) =>
      pages.flatMap((page) => page.entityIds),
    ),
  );
  const pinnedEntityIds = getRetainedEntityPins("feed-item");
  const shouldPersistItem = (id: string) =>
    state.pageOwnedFeedItemIds[id] !== true ||
    persistedPageEntityIds.has(id) ||
    pinnedEntityIds.has(id) ||
    (state.feedItemsDict[id] !== undefined &&
      hasRetainedFeedBody(
        state.feedItemsDict[id],
        state.retainedFeedItemBodyIds[id] === true,
      ));
  const feedItemsDict = Object.fromEntries(
    Object.entries(state.feedItemsDict)
      .filter(([id]) => shouldPersistItem(id))
      .map(([id, item]) => [id, stripIneligibleFeedBodyForPersistence(item)]),
  );
  return {
    feedItemsDict,
    feedItemsOrder: state.feedItemsOrder.filter(shouldPersistItem),
    scopeFeedItemIds: Object.fromEntries(
      Object.entries(state.scopeFeedItemIds).map(([scopeKey, ids]) => [
        scopeKey,
        ids.filter(shouldPersistItem),
      ]),
    ),
    retainedFeedPages,
    retainedFeedPageBytes: retainedPageBytes(retainedFeedPages),
    pageOwnedFeedItemIds: Object.fromEntries(
      Object.keys(state.pageOwnedFeedItemIds)
        .filter((id) => shouldPersistItem(id))
        .map((id) => [id, true as const]),
    ),
    retainedFeedItemBodyIds: Object.fromEntries(
      Object.keys(state.retainedFeedItemBodyIds)
        .filter((id) => shouldPersistItem(id))
        .map((id) => [id, true as const]),
    ),
  };
}
