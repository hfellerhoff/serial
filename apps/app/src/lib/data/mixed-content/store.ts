import { createStore } from "zustand";
import { persist } from "zustand/middleware";
import { createNormalizedIDBStorage } from "../normalized-idb-storage";
import { createSelectorHooks } from "../createSelectorHooks";
import {
  bookmarkReference,
  bookmarkVisibility,
  buildProjectionIndexes,
  canonicalize,
  collisionScopeKeys,
  emptyProjectionIndexes,
  getMixedScopeKey,
  isBookmarkProjectionChange,
  matchesScope,
  matchingLoadedScopeKeys,
  referenceRecordsEqual,
  referencesEqual,
  replaceScopeInIndexes,
  uniqueReferences,
} from "./bookmarkProjection";
import {
  filterSuppressedReferences,
  getMixedRetentionPins,
  getPersistedMixedContentState,
  mergeRetainedMixedPage,
  mixedReferenceKey,
  retainedMixedReferenceKeys,
  updateBookmarkPageMembership,
} from "./page-retention";
import type { ProjectionIndexes } from "./bookmarkProjection";
import type {
  LoadedMixedScope,
  PersistedMixedContentState,
  SuppressedReferences,
} from "./page-retention";
import type { VisibilityFilter } from "../atoms";
import type { ApplicationFeedItem, ApplicationView } from "~/server/db/schema";
import type {
  ApplicationBookmark,
  MixedContentPage,
  MixedContentScope,
} from "~/server/mixed-content/projection";

export { getMixedScopeKey } from "./bookmarkProjection";
export type { LoadedMixedScope } from "./page-retention";

type MixedContentStore = {
  scopes: Record<string, LoadedMixedScope>;
  fetchingScopes: Record<string, boolean>;
  suppressedReferences: SuppressedReferences;
  projectionIndexes: ProjectionIndexes;
  projectionIndexesComplete: boolean;
  reset: () => void;
  setScopeFetching: (scopeKey: string, isFetching: boolean) => void;
  applyPage: (input: {
    scope: MixedContentScope;
    visibility: VisibilityFilter;
    page: MixedContentPage;
    replacesScope: boolean;
    feedItems: Record<string, ApplicationFeedItem>;
  }) => void;
  reprojectUpsert: (input: {
    bookmark: ApplicationBookmark;
    previousBookmark: ApplicationBookmark | undefined;
    feedItems: Record<string, ApplicationFeedItem>;
    views: ApplicationView[];
  }) => LoadedMixedScope[];
  reprojectDeletion: (input: {
    bookmarkId: string;
    feedItems: Record<string, ApplicationFeedItem>;
  }) => LoadedMixedScope[];
};

const vanillaMixedContentStore = createStore<MixedContentStore>()(
  persist<MixedContentStore, [], [], PersistedMixedContentState>(
    (set, get) => ({
      scopes: {},
      fetchingScopes: {},
      suppressedReferences: {},
      projectionIndexes: emptyProjectionIndexes(),
      projectionIndexesComplete: true,
      reset: () =>
        set({
          scopes: {},
          fetchingScopes: {},
          suppressedReferences: {},
          projectionIndexes: emptyProjectionIndexes(),
          projectionIndexesComplete: true,
        }),
      setScopeFetching: (scopeKey, isFetching) =>
        set((state) => ({
          fetchingScopes: {
            ...state.fetchingScopes,
            [scopeKey]: isFetching,
          },
        })),
      applyPage: ({ scope, visibility, page, replacesScope, feedItems }) => {
        const key = getMixedScopeKey(scope, visibility);
        const current = get();
        const existing = current.scopes[key];
        const requestCursor = replacesScope ? null : existing?.cursor;
        const pages = mergeRetainedMixedPage({
          pages: existing?.pages ?? [],
          page,
          requestCursor,
          replacesScope,
        });
        const retainedKeys = retainedMixedReferenceKeys(pages);
        const pinnedEntityIds = getMixedRetentionPins();
        const nextScope = {
          scope,
          visibility,
          references: uniqueReferences(
            replacesScope
              ? page.references
              : [...(existing?.references ?? []), ...page.references],
          ).filter(
            (reference) =>
              retainedKeys.has(mixedReferenceKey(reference)) ||
              pinnedEntityIds.has(reference.entityId),
          ),
          pages,
          cursor: page.cursor,
          hasMore: page.hasMore,
        };
        const scopes = { ...current.scopes, [key]: nextScope };
        const projectionIndexes = current.projectionIndexesComplete
          ? current.projectionIndexes
          : buildProjectionIndexes(scopes, feedItems);
        if (current.projectionIndexesComplete) {
          replaceScopeInIndexes({
            indexes: projectionIndexes,
            scopeKey: key,
            previousReferences: existing?.references ?? [],
            nextReferences: nextScope.references,
            feedItems,
          });
        }
        set({
          scopes,
          suppressedReferences: filterSuppressedReferences(
            current.suppressedReferences,
            { [key]: retainedKeys },
            pinnedEntityIds,
          ),
          projectionIndexes,
          projectionIndexesComplete: true,
        });
      },
      reprojectUpsert: ({ bookmark, previousBookmark, feedItems, views }) => {
        if (!isBookmarkProjectionChange(previousBookmark, bookmark)) return [];

        const current = get();
        const projectionIndexes = current.projectionIndexesComplete
          ? current.projectionIndexes
          : buildProjectionIndexes(current.scopes, feedItems);
        const candidateKeys = new Set(
          projectionIndexes.bookmarkScopeKeys[bookmark.id] ?? [],
        );
        if (previousBookmark) {
          for (const key of matchingLoadedScopeKeys(
            previousBookmark,
            current.scopes,
            views,
          )) {
            candidateKeys.add(key);
          }
        }
        for (const key of matchingLoadedScopeKeys(
          bookmark,
          current.scopes,
          views,
        )) {
          candidateKeys.add(key);
        }

        const canonicalChanged =
          previousBookmark?.canonicalUrl !== bookmark.canonicalUrl;
        const previousSuppressed =
          current.suppressedReferences[bookmark.id] ?? {};
        const nextSuppressedForBookmark = canonicalChanged
          ? {}
          : { ...previousSuppressed };
        if (canonicalChanged) {
          for (const key of Object.keys(previousSuppressed)) {
            candidateKeys.add(key);
          }
          for (const key of collisionScopeKeys(
            bookmark.canonicalUrl,
            projectionIndexes,
          )) {
            candidateKeys.add(key);
          }
        }

        let scopes = current.scopes;
        const affected: LoadedMixedScope[] = [];
        for (const key of candidateKeys) {
          const scopeState = current.scopes[key];
          if (!scopeState) continue;
          let references = scopeState.references.filter(
            (reference) =>
              reference.entityKind !== "bookmark" ||
              reference.entityId !== bookmark.id,
          );
          if (canonicalChanged) {
            references = uniqueReferences([
              ...references,
              ...(previousSuppressed[key] ?? []),
            ]);
          }

          const newlySuppressed = references.filter((reference) => {
            if (reference.entityKind !== "feed-item") return false;
            const item = feedItems[reference.entityId];
            return item?.url
              ? canonicalize(item.url) === bookmark.canonicalUrl
              : false;
          });
          if (newlySuppressed.length > 0) {
            nextSuppressedForBookmark[key] = uniqueReferences([
              ...(nextSuppressedForBookmark[key] ?? []),
              ...newlySuppressed,
            ]);
          }
          const newlySuppressedIds = new Set(
            newlySuppressed.map((reference) => reference.entityId),
          );
          references = references.filter(
            (reference) =>
              reference.entityKind !== "feed-item" ||
              !newlySuppressedIds.has(reference.entityId),
          );
          if (
            bookmarkVisibility(bookmark) === scopeState.visibility &&
            matchesScope(bookmark, scopeState.scope, views)
          ) {
            references = [
              ...references,
              bookmarkReference(bookmark, scopeState, views),
            ];
          }
          references = uniqueReferences(references);
          if (referencesEqual(scopeState.references, references)) continue;

          const nextScope = {
            ...scopeState,
            references,
            pages: updateBookmarkPageMembership(
              scopeState.pages,
              bookmark.id,
              references.some(
                (reference) =>
                  reference.entityKind === "bookmark" &&
                  reference.entityId === bookmark.id,
              ),
            ),
          };
          if (scopes === current.scopes) scopes = { ...current.scopes };
          scopes[key] = nextScope;
          replaceScopeInIndexes({
            indexes: projectionIndexes,
            scopeKey: key,
            previousReferences: scopeState.references,
            nextReferences: references,
            feedItems,
          });
          affected.push(nextScope);
        }

        const suppressedReferences = { ...current.suppressedReferences };
        if (Object.keys(nextSuppressedForBookmark).length > 0) {
          suppressedReferences[bookmark.id] = nextSuppressedForBookmark;
        } else {
          delete suppressedReferences[bookmark.id];
        }
        const suppressionChanged = !referenceRecordsEqual(
          previousSuppressed,
          nextSuppressedForBookmark,
        );
        if (
          affected.length > 0 ||
          suppressionChanged ||
          !current.projectionIndexesComplete
        ) {
          set({
            scopes,
            suppressedReferences,
            projectionIndexes,
            projectionIndexesComplete: true,
          });
        }
        return affected;
      },
      reprojectDeletion: ({ bookmarkId, feedItems }) => {
        const current = get();
        const projectionIndexes = current.projectionIndexesComplete
          ? current.projectionIndexes
          : buildProjectionIndexes(current.scopes, feedItems);
        const hadSuppressedReferences =
          current.suppressedReferences[bookmarkId] !== undefined;
        const suppressedForBookmark =
          current.suppressedReferences[bookmarkId] ?? {};
        const candidateKeys = new Set([
          ...(projectionIndexes.bookmarkScopeKeys[bookmarkId] ?? []),
          ...Object.keys(suppressedForBookmark),
        ]);
        let scopes = current.scopes;
        const affected: LoadedMixedScope[] = [];
        for (const key of candidateKeys) {
          const scopeState = current.scopes[key];
          if (!scopeState) continue;
          const references = uniqueReferences([
            ...scopeState.references.filter(
              (reference) =>
                reference.entityKind !== "bookmark" ||
                reference.entityId !== bookmarkId,
            ),
            ...(suppressedForBookmark[key] ?? []),
          ]);
          if (referencesEqual(scopeState.references, references)) continue;

          const nextScope = {
            ...scopeState,
            references,
            pages: updateBookmarkPageMembership(
              scopeState.pages,
              bookmarkId,
              false,
            ),
          };
          if (scopes === current.scopes) scopes = { ...current.scopes };
          scopes[key] = nextScope;
          replaceScopeInIndexes({
            indexes: projectionIndexes,
            scopeKey: key,
            previousReferences: scopeState.references,
            nextReferences: references,
            feedItems,
          });
          affected.push(nextScope);
        }
        const { [bookmarkId]: _removed, ...suppressedReferences } =
          current.suppressedReferences;
        void _removed;
        if (
          affected.length > 0 ||
          hadSuppressedReferences ||
          !current.projectionIndexesComplete
        ) {
          set({
            scopes,
            suppressedReferences,
            projectionIndexes,
            projectionIndexesComplete: true,
          });
        }
        return affected;
      },
    }),
    {
      name: "serial-mixed-content-store-v2",
      storage: createNormalizedIDBStorage({
        recordFields: ["scopes", "suppressedReferences"],
      }),
      partialize: getPersistedMixedContentState,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<MixedContentStore>;
        const scopes = Object.fromEntries(
          Object.entries(persisted?.scopes ?? {}).map(([key, scope]) => [
            key,
            { ...scope, pages: scope.pages ?? [] },
          ]),
        );
        return {
          ...currentState,
          ...(persisted ?? {}),
          scopes,
          projectionIndexes: emptyProjectionIndexes(),
          projectionIndexesComplete: Object.keys(scopes).length === 0,
        };
      },
    },
  ),
);

export const mixedContentStore = createSelectorHooks(vanillaMixedContentStore);
