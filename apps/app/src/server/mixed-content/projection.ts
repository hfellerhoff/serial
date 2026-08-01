import {
  loadApplicationBookmarks,
  loadApplicationBookmarksById,
} from "./projection/applicationBookmarks";
import {
  compareCandidates,
  queryBookmarkCandidates,
  queryFeedCandidates,
} from "./projection/candidates";
import { loadScopeData } from "./projection/scope";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { db as defaultDatabase } from "~/server/db";
import type { ApplicationFeedItem, DatabaseBookmark } from "~/server/db/schema";
import { INBOX_VIEW_ID } from "~/lib/data/views/constants";

type MixedContentDatabase = typeof defaultDatabase;

export type MixedContentScope =
  { type: "view"; viewId: number } | { type: "tag"; tagId: number };

export type MixedContentEntityKind = "bookmark" | "feed-item";

export type MixedContentCursor = {
  sectionPlacement: number | null;
  normalizedAt: Date;
  entityKind: MixedContentEntityKind;
  entityId: string;
} | null;

export type ApplicationBookmark = DatabaseBookmark & {
  title: string;
  author: string | null;
  publishedAt: Date | null;
  effectiveUrl: string | null;
  iconUrl: string | null;
  representativeImageUrl: string | null;
  captureHash: string | null;
  capturedAt: Date | null;
  viewIds: number[];
  tagIds: number[];
};

export type MixedContentReference = {
  entityKind: MixedContentEntityKind;
  entityId: string;
  sectionPlacement: number | null;
  normalizedAt: Date;
};

export type MixedContentPage = {
  references: MixedContentReference[];
  bookmarks: ApplicationBookmark[];
  feedItems: ApplicationFeedItem[];
  cursor: MixedContentCursor;
  hasMore: boolean;
};

export { loadApplicationBookmarks, loadApplicationBookmarksById };

export async function queryMixedContentPage(input: {
  database: MixedContentDatabase;
  userId: string;
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  cursor?: MixedContentCursor;
  limit: number;
}): Promise<MixedContentPage> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 500) {
    throw new Error("Mixed-content page limit must be between 1 and 500");
  }
  const scopeData = await loadScopeData(input);
  if (!scopeData.valid) {
    return {
      references: [],
      bookmarks: [],
      feedItems: [],
      cursor: null,
      hasMore: false,
    };
  }
  const hasSections =
    input.visibility !== "read" &&
    input.scope.type === "view" &&
    input.scope.viewId !== INBOX_VIEW_ID &&
    scopeData.sections.length > 0;
  const [bookmarkCandidates, feedCandidates] = await Promise.all([
    queryBookmarkCandidates({ ...input, scopeData, hasSections }),
    queryFeedCandidates({ ...input, scopeData, hasSections }),
  ]);
  const candidates = [...bookmarkCandidates, ...feedCandidates].sort(
    compareCandidates,
  );
  const hasMore = candidates.length > input.limit;
  const pageCandidates = candidates.slice(0, input.limit);
  const pageBookmarkIds = pageCandidates.flatMap((candidate) =>
    candidate.entityKind === "bookmark" ? [candidate.entityId] : [],
  );
  const pageBookmarks = await loadApplicationBookmarksById({
    database: input.database,
    userId: input.userId,
    bookmarkIds: pageBookmarkIds,
  });
  const lastCandidate = pageCandidates.at(-1);
  const cursor: MixedContentCursor =
    hasMore && lastCandidate
      ? {
          sectionPlacement: lastCandidate.sectionPlacement,
          normalizedAt: lastCandidate.normalizedAt,
          entityKind: lastCandidate.entityKind,
          entityId: lastCandidate.entityId,
        }
      : null;
  return {
    references: pageCandidates.map((candidate) => ({
      entityKind: candidate.entityKind,
      entityId: candidate.entityId,
      sectionPlacement: candidate.sectionPlacement,
      normalizedAt: candidate.normalizedAt,
    })),
    bookmarks: pageBookmarks,
    feedItems: pageCandidates.flatMap((candidate) =>
      candidate.entityKind === "feed-item" ? [candidate.item] : [],
    ),
    cursor,
    hasMore,
  };
}
