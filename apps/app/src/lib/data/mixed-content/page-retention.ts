import {
  CLIENT_PAGE_RETENTION_BUDGETS,
  cursorRetentionKey,
  enforcePageRetention,
  estimateRetainedBytes,
  getRetainedEntityPins,
  selectPersistedPages,
} from "../page-retention";
import type { RetainedCursorPage } from "../page-retention";
import type { VisibilityFilter } from "../atoms";
import type {
  MixedContentCursor,
  MixedContentPage,
  MixedContentReference,
  MixedContentScope,
} from "~/server/mixed-content/projection";

type MixedPageRetentionValue = {
  referenceKeys: string[];
};

export type LoadedMixedScope = {
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  references: MixedContentReference[];
  pages: Array<RetainedCursorPage<MixedPageRetentionValue>>;
  cursor: MixedContentCursor;
  hasMore: boolean;
};

export type SuppressedReferences = Record<
  string,
  Record<string, MixedContentReference[]>
>;

export type PersistedMixedContentState = {
  scopes: Record<string, LoadedMixedScope>;
  suppressedReferences: SuppressedReferences;
};

export function mixedReferenceKey(reference: MixedContentReference) {
  return `${reference.entityKind}:${reference.entityId}`;
}

export function retainedMixedReferenceKeys(
  pages: Array<RetainedCursorPage<MixedPageRetentionValue>>,
) {
  return new Set(pages.flatMap((page) => page.value.referenceKeys));
}

export function mergeRetainedMixedPage({
  pages,
  page,
  requestCursor,
  replacesScope,
}: {
  pages: Array<RetainedCursorPage<MixedPageRetentionValue>>;
  page: MixedContentPage;
  requestCursor: unknown;
  replacesScope: boolean;
}) {
  const sourcePages = replacesScope ? [] : pages;
  const requestCursorKey = cursorRetentionKey(requestCursor);
  const nextCursorKey = cursorRetentionKey(page.cursor);
  const key = `${requestCursorKey}->${nextCursorKey}`;
  const referenceKeys = page.references.map(mixedReferenceKey);
  const existingIndex = sourcePages.findIndex(
    (candidate) => candidate.key === key,
  );
  const sequence =
    existingIndex >= 0
      ? sourcePages[existingIndex]!.sequence
      : Math.max(-1, ...sourcePages.map((candidate) => candidate.sequence)) + 1;
  const value = { referenceKeys };
  const retainedPage: RetainedCursorPage<MixedPageRetentionValue> = {
    key,
    requestCursorKey,
    nextCursorKey,
    entityIds: page.references.map((reference) => reference.entityId),
    value,
    byteSize: estimateRetainedBytes(value),
    sequence,
  };
  const nextPages = [...sourcePages];
  if (existingIndex >= 0) {
    nextPages[existingIndex] = retainedPage;
  } else {
    nextPages.push(retainedPage);
  }
  return enforcePageRetention({
    pages: nextPages,
    budget: CLIENT_PAGE_RETENTION_BUDGETS.memory,
    pinnedEntityIds: getMixedRetentionPins(),
  });
}

export function updateReferencePageMembership(
  pages: Array<RetainedCursorPage<MixedPageRetentionValue>>,
  reference: Pick<MixedContentReference, "entityKind" | "entityId">,
  isRetained: boolean,
) {
  const referenceKey = mixedReferenceKey({
    ...reference,
    sectionPlacement: null,
    normalizedAt: new Date(0),
  });
  const isCurrentlyRetained = pages.some((page) =>
    page.value.referenceKeys.includes(referenceKey),
  );
  if (isCurrentlyRetained === isRetained) return pages;
  const nextPages = pages.map((page) => {
    const referenceKeys = page.value.referenceKeys.filter(
      (key) => key !== referenceKey,
    );
    const value = { referenceKeys };
    return {
      ...page,
      entityIds: page.entityIds.filter((id) => id !== reference.entityId),
      value,
      byteSize: estimateRetainedBytes(value),
    };
  });
  if (!isRetained || nextPages.length === 0) return nextPages;

  const latestPage = nextPages[nextPages.length - 1]!;
  const value = {
    referenceKeys: [...latestPage.value.referenceKeys, referenceKey],
  };
  nextPages[nextPages.length - 1] = {
    ...latestPage,
    entityIds: [...latestPage.entityIds, reference.entityId],
    value,
    byteSize: estimateRetainedBytes(value),
  };
  return nextPages;
}

export function updateBookmarkPageMembership(
  pages: Array<RetainedCursorPage<MixedPageRetentionValue>>,
  bookmarkId: string,
  isRetained: boolean,
) {
  return updateReferencePageMembership(
    pages,
    { entityKind: "bookmark", entityId: bookmarkId },
    isRetained,
  );
}

export function getMixedRetentionPins() {
  return new Set([
    ...getRetainedEntityPins("feed-item"),
    ...getRetainedEntityPins("bookmark"),
  ]);
}

export function filterSuppressedReferences(
  suppressedReferences: SuppressedReferences,
  retainedKeysByScope: Record<string, ReadonlySet<string>>,
  pinnedEntityIds: ReadonlySet<string> = new Set(),
) {
  return Object.fromEntries(
    Object.entries(suppressedReferences).flatMap(
      ([bookmarkId, referencesByScope]) => {
        const nextReferencesByScope = Object.fromEntries(
          Object.entries(referencesByScope).flatMap(
            ([scopeKey, references]) => {
              const retainedKeys = retainedKeysByScope[scopeKey];
              const retainedReferences = retainedKeys
                ? references.filter(
                    (reference) =>
                      retainedKeys.has(mixedReferenceKey(reference)) ||
                      pinnedEntityIds.has(reference.entityId),
                  )
                : references;
              return retainedReferences.length > 0
                ? [[scopeKey, retainedReferences]]
                : [];
            },
          ),
        );
        return Object.keys(nextReferencesByScope).length > 0
          ? [[bookmarkId, nextReferencesByScope]]
          : [];
      },
    ),
  );
}

export function getPersistedMixedContentState(state: {
  scopes: Record<string, LoadedMixedScope>;
  suppressedReferences: SuppressedReferences;
}): PersistedMixedContentState {
  const scopes = Object.fromEntries(
    Object.entries(state.scopes).map(([key, scope]) => {
      const pages = selectPersistedPages(scope.pages);
      const retainedKeys = retainedMixedReferenceKeys(pages);
      return [
        key,
        {
          ...scope,
          pages,
          references: scope.references.filter((reference) =>
            retainedKeys.has(mixedReferenceKey(reference)),
          ),
        },
      ];
    }),
  );
  const retainedKeysByScope = Object.fromEntries(
    Object.entries(scopes).map(([key, scope]) => [
      key,
      retainedMixedReferenceKeys(scope.pages),
    ]),
  );
  return {
    scopes,
    suppressedReferences: filterSuppressedReferences(
      state.suppressedReferences,
      retainedKeysByScope,
    ),
  };
}
