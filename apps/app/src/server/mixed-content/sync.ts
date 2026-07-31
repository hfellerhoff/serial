import { loadApplicationBookmarks } from "./projection";
import type {
  ApplicationBookmark,
  MixedContentPage,
  MixedContentScope,
} from "./projection";
import type { db as defaultDatabase } from "~/server/db";
import type { VisibilityFilter } from "~/lib/data/atoms";
import { bookmarkManifestValue } from "~/lib/data/bookmarks/manifest";
import { getUserChannel } from "~/server/api/channels";
import { publisher } from "~/server/api/publisher";

type MixedContentDatabase = typeof defaultDatabase;

export type BookmarkManifestEntry = {
  id: string;
  version: string;
};

export type BookmarkDiffEntry =
  | { status: "unchanged"; id: string }
  | { status: "new" | "updated"; bookmark: ApplicationBookmark }
  | { status: "deleted"; id: string };

export type BookmarkSyncChunk =
  | { type: "bookmark-diff"; diff: BookmarkDiffEntry[] }
  | { type: "bookmark-upsert"; bookmark: ApplicationBookmark }
  | { type: "bookmark-delete"; id: string; canonicalUrl: string };

export type MixedContentChunk = {
  type: "mixed-content-page";
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  page: MixedContentPage;
  replacesScope: boolean;
};

export function computeBookmarkDiff(
  serverBookmarks: ApplicationBookmark[],
  clientManifest: BookmarkManifestEntry[],
): BookmarkDiffEntry[] {
  const clientVersions = new Map(
    clientManifest.map((entry) => [entry.id, entry.version]),
  );
  const serverIds = new Set(serverBookmarks.map((bookmark) => bookmark.id));
  const diff: BookmarkDiffEntry[] = serverBookmarks.map((bookmark) => {
    const clientVersion = clientVersions.get(bookmark.id);
    if (clientVersion === undefined) return { status: "new", bookmark };
    if (clientVersion === bookmarkManifestValue(bookmark)) {
      return { status: "unchanged", id: bookmark.id };
    }
    return { status: "updated", bookmark };
  });

  for (const entry of clientManifest) {
    if (!serverIds.has(entry.id))
      diff.push({ status: "deleted", id: entry.id });
  }
  return diff;
}

export async function buildBookmarkDiff(input: {
  database: MixedContentDatabase;
  userId: string;
  clientManifest: BookmarkManifestEntry[];
}) {
  const serverBookmarks = await loadApplicationBookmarks(input);
  return computeBookmarkDiff(serverBookmarks, input.clientManifest);
}

export async function loadApplicationBookmark(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const bookmarks = await loadApplicationBookmarks(input);
  return bookmarks.find((bookmark) => bookmark.id === input.bookmarkId) ?? null;
}

export async function publishBookmarkUpsert(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const bookmark = await loadApplicationBookmark(input);
  if (!bookmark) return;
  await publisher.publish(getUserChannel(input.userId), {
    source: "bookmark",
    chunk: { type: "bookmark-upsert", bookmark },
  });
}

export async function publishBookmarkDeletion(input: {
  userId: string;
  id: string;
  canonicalUrl: string;
}) {
  await publisher.publish(getUserChannel(input.userId), {
    source: "bookmark",
    chunk: {
      type: "bookmark-delete",
      id: input.id,
      canonicalUrl: input.canonicalUrl,
    },
  });
}
