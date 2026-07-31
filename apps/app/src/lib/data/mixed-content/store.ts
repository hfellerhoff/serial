import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createIDBStorage } from "../idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import type { VisibilityFilter } from "../atoms";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentCursor,
  MixedContentPage,
  MixedContentReference,
  MixedContentScope,
} from "~/server/mixed-content/projection";

export type LoadedMixedScope = {
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  references: MixedContentReference[];
  cursor: MixedContentCursor;
  hasMore: boolean;
};

type SuppressedReferences = Record<
  string,
  Record<string, MixedContentReference[]>
>;

type MixedContentStore = {
  scopes: Record<string, LoadedMixedScope>;
  suppressedReferences: SuppressedReferences;
  reset: () => void;
  applyPage: (input: {
    scope: MixedContentScope;
    visibility: VisibilityFilter;
    page: MixedContentPage;
    replacesScope: boolean;
  }) => void;
  reprojectUpsert: (input: {
    bookmark: ApplicationBookmark;
    feedItems: Record<string, ApplicationFeedItem>;
    views: ApplicationView[];
  }) => LoadedMixedScope[];
  reprojectDeletion: (bookmarkId: string) => LoadedMixedScope[];
};

export function getMixedScopeKey(
  scope: MixedContentScope,
  visibility: VisibilityFilter,
) {
  return scope.type === "view"
    ? `view:${scope.viewId}:${visibility}`
    : `tag:${scope.tagId}:${visibility}`;
}

function compareReferences(
  left: MixedContentReference,
  right: MixedContentReference,
) {
  const leftPlacement = left.sectionPlacement ?? 0;
  const rightPlacement = right.sectionPlacement ?? 0;
  if (leftPlacement !== rightPlacement) return leftPlacement - rightPlacement;
  const timeDifference =
    right.normalizedAt.getTime() - left.normalizedAt.getTime();
  if (timeDifference !== 0) return timeDifference;
  const kindDifference = left.entityKind.localeCompare(right.entityKind);
  if (kindDifference !== 0) return kindDifference;
  return right.entityId.localeCompare(left.entityId);
}

function matchesVisibility(
  bookmark: ApplicationBookmark,
  visibility: VisibilityFilter,
) {
  if (visibility === "later") return bookmark.isSaved;
  if (bookmark.isSaved) return false;
  return visibility === "read" ? bookmark.isRead : !bookmark.isRead;
}

function matchesScope(
  bookmark: ApplicationBookmark,
  scope: MixedContentScope,
  views: ApplicationView[],
) {
  const bookmarkTagIds = new Set(bookmark.tagIds);
  const bookmarkViewIds = new Set(bookmark.viewIds);
  if (scope.type === "tag") return bookmarkTagIds.has(scope.tagId);
  const customViews = views.filter((view) => view.id >= 0);
  if (scope.viewId < 0) {
    return !customViews.some(
      (view) =>
        (view.contentType === "all" || view.contentType === "longform") &&
        (bookmarkViewIds.has(view.id) ||
          view.categoryIds.some((tagId) => bookmarkTagIds.has(tagId)) ||
          (view.feedIds.length === 0 && view.categoryIds.length === 0)),
    );
  }
  const view = customViews.find((candidate) => candidate.id === scope.viewId);
  if (
    !view ||
    (view.contentType !== "all" && view.contentType !== "longform")
  ) {
    return false;
  }
  return (
    bookmarkViewIds.has(view.id) ||
    view.categoryIds.some((tagId) => bookmarkTagIds.has(tagId)) ||
    (view.feedIds.length === 0 && view.categoryIds.length === 0)
  );
}

function bookmarkReference(
  bookmark: ApplicationBookmark,
  scopeState: LoadedMixedScope,
  views: ApplicationView[],
): MixedContentReference {
  const scope = scopeState.scope;
  const bookmarkTagIds = new Set(bookmark.tagIds);
  const view =
    scope.type === "view"
      ? views.find((candidate) => candidate.id === scope.viewId)
      : undefined;
  const hasSections =
    scopeState.visibility !== "read" && (view?.viewSections.length ?? 0) > 0;
  const matchingPlacements =
    view?.viewSections
      .filter(
        (section) =>
          section.itemType === "tag" && bookmarkTagIds.has(section.itemId),
      )
      .map((section) => section.placement) ?? [];
  const normalizedAt =
    scopeState.visibility === "later"
      ? bookmark.savedUpdatedAt
      : scopeState.visibility === "read"
        ? bookmark.readUpdatedAt
        : bookmark.createdAt;
  return {
    entityKind: "bookmark",
    entityId: bookmark.id,
    sectionPlacement: hasSections
      ? matchingPlacements.length > 0
        ? Math.min(...matchingPlacements)
        : 999_999
      : null,
    normalizedAt,
  };
}

function uniqueReferences(references: MixedContentReference[]) {
  const byKey = new Map(
    references.map((reference) => [
      `${reference.entityKind}:${reference.entityId}`,
      reference,
    ]),
  );
  return [...byKey.values()].sort(compareReferences);
}

const vanillaMixedContentStore = createStore<MixedContentStore>()(
  persist(
    (set, get) => ({
      scopes: {},
      suppressedReferences: {},
      reset: () => set({ scopes: {}, suppressedReferences: {} }),
      applyPage: ({ scope, visibility, page, replacesScope }) => {
        const key = getMixedScopeKey(scope, visibility);
        const existing = get().scopes[key];
        set({
          scopes: {
            ...get().scopes,
            [key]: {
              scope,
              visibility,
              references: uniqueReferences(
                replacesScope
                  ? page.references
                  : [...(existing?.references ?? []), ...page.references],
              ),
              cursor: page.cursor,
              hasMore: page.hasMore,
            },
          },
        });
      },
      reprojectUpsert: ({ bookmark, feedItems, views }) => {
        const scopes = { ...get().scopes };
        const suppressedReferences = { ...get().suppressedReferences };
        const bookmarkSuppressed = {
          ...(suppressedReferences[bookmark.id] ?? {}),
        };
        const affected: LoadedMixedScope[] = [];

        for (const [key, scopeState] of Object.entries(scopes)) {
          const newlySuppressed = scopeState.references.filter((reference) => {
            if (reference.entityKind !== "feed-item") return false;
            const item = feedItems[reference.entityId];
            return item?.url
              ? canonicalize(item.url) === bookmark.canonicalUrl
              : false;
          });
          if (newlySuppressed.length > 0) {
            bookmarkSuppressed[key] = uniqueReferences([
              ...(bookmarkSuppressed[key] ?? []),
              ...newlySuppressed,
            ]);
          }
          const newlySuppressedKeys = new Set(
            newlySuppressed.map(
              (reference) => `${reference.entityKind}:${reference.entityId}`,
            ),
          );
          let references = scopeState.references.filter(
            (reference) =>
              reference.entityId !== bookmark.id &&
              !newlySuppressedKeys.has(
                `${reference.entityKind}:${reference.entityId}`,
              ),
          );
          if (
            matchesVisibility(bookmark, scopeState.visibility) &&
            matchesScope(bookmark, scopeState.scope, views)
          ) {
            references = [
              ...references,
              bookmarkReference(bookmark, scopeState, views),
            ];
          }
          const nextScope = {
            ...scopeState,
            references: uniqueReferences(references),
          };
          scopes[key] = nextScope;
          affected.push(nextScope);
        }
        suppressedReferences[bookmark.id] = bookmarkSuppressed;
        set({ scopes, suppressedReferences });
        return affected;
      },
      reprojectDeletion: (bookmarkId) => {
        const scopes = { ...get().scopes };
        const suppressedForBookmark =
          get().suppressedReferences[bookmarkId] ?? {};
        const affected: LoadedMixedScope[] = [];
        for (const [key, scopeState] of Object.entries(scopes)) {
          const nextScope = {
            ...scopeState,
            references: uniqueReferences([
              ...scopeState.references.filter(
                (reference) =>
                  !(
                    reference.entityKind === "bookmark" &&
                    reference.entityId === bookmarkId
                  ),
              ),
              ...(suppressedForBookmark[key] ?? []),
            ]),
          };
          scopes[key] = nextScope;
          affected.push(nextScope);
        }
        const { [bookmarkId]: _removed, ...suppressedReferences } =
          get().suppressedReferences;
        void _removed;
        set({ scopes, suppressedReferences });
        return affected;
      },
    }),
    {
      name: "serial-mixed-content-store",
      storage: createIDBStorage(),
      partialize: (state) => ({
        scopes: state.scopes,
        suppressedReferences: state.suppressedReferences,
      }),
    },
  ),
);

function canonicalize(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.protocol === "http:" && parsed.port === "80") parsed.port = "";
    if (parsed.protocol === "https:" && parsed.port === "443") parsed.port = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

export const mixedContentStore = createSelectorHooks(vanillaMixedContentStore);
