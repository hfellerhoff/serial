import { loadApplicationBookmarksById } from "./projection";
import type {
  ApplicationBookmark,
  MixedContentPage,
  MixedContentScope,
} from "./projection";
import type { db as defaultDatabase } from "~/server/db";
import type { VisibilityFilter } from "~/lib/data/atoms";
import type { BookmarkSyncManifestEntry } from "~/lib/data/bookmarks/manifest";
import {
  BOOKMARK_SYNC_PAGE_SIZE,
  BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES,
  bookmarkSyncBucketVersion,
  buildBookmarkSyncBuckets,
} from "~/lib/data/bookmarks/manifest";
import { getUserChannel } from "~/server/api/channels";
import { publisher } from "~/server/api/publisher";

type MixedContentDatabase = typeof defaultDatabase;

export type BookmarkSyncBucketPage = {
  type: "bookmark-sync-bucket";
  bucket: number;
  version: string;
  bookmarks: ApplicationBookmark[];
  replacesBucket: boolean;
  completesBucket: boolean;
};

export type BookmarkSyncChunk =
  | BookmarkSyncBucketPage
  | { type: "bookmark-upsert"; bookmark: ApplicationBookmark }
  | { type: "bookmark-upsert-batch"; bookmarks: ApplicationBookmark[] }
  | { type: "bookmark-delete"; id: string; canonicalUrl: string };

export type MixedContentChunk = {
  type: "mixed-content-page";
  scope: MixedContentScope;
  visibility: VisibilityFilter;
  page: MixedContentPage;
  replacesScope: boolean;
};

export function computeChangedBookmarkSyncBuckets(
  serverBookmarks: ApplicationBookmark[],
  clientManifest: BookmarkSyncManifestEntry[],
) {
  const clientVersions = new Map(
    clientManifest.map((entry) => [entry.bucket, entry.version]),
  );
  return buildBookmarkSyncBuckets(serverBookmarks).flatMap(
    (bookmarks, bucket) => {
      const version = bookmarkSyncBucketVersion(bookmarks);
      return clientVersions.get(bucket) === version
        ? []
        : [{ bucket, version, bookmarks }];
    },
  );
}

function serializedBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function buildBookmarkSyncPages(input: {
  bucket: number;
  version: string;
  bookmarks: ApplicationBookmark[];
}): BookmarkSyncBucketPage[] {
  const bookmarkPages: ApplicationBookmark[][] = [];
  let current: ApplicationBookmark[] = [];

  for (const bookmark of input.bookmarks) {
    const candidate = [...current, bookmark];
    const exceedsCount = candidate.length > BOOKMARK_SYNC_PAGE_SIZE;
    const exceedsBytes =
      serializedBytes({
        type: "bookmark-sync-bucket",
        bucket: input.bucket,
        version: input.version,
        bookmarks: candidate,
        replacesBucket: bookmarkPages.length === 0,
        completesBucket: false,
      }) > BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES;
    if ((exceedsCount || exceedsBytes) && current.length > 0) {
      bookmarkPages.push(current);
      current = [bookmark];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0 || bookmarkPages.length === 0) {
    bookmarkPages.push(current);
  }

  return bookmarkPages.map((bookmarks, index) => {
    const page = {
      type: "bookmark-sync-bucket" as const,
      bucket: input.bucket,
      version: input.version,
      bookmarks,
      replacesBucket: index === 0,
      completesBucket: index === bookmarkPages.length - 1,
    };
    if (serializedBytes(page) > BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES) {
      throw new Error("One Bookmark exceeds the synchronization byte budget");
    }
    return page;
  });
}

export async function loadApplicationBookmark(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const bookmarks = await loadApplicationBookmarksById({
    ...input,
    bookmarkIds: [input.bookmarkId],
  });
  return bookmarks.find((bookmark) => bookmark.id === input.bookmarkId) ?? null;
}

export async function publishBookmarkUpsert(input: {
  database: MixedContentDatabase;
  userId: string;
  bookmarkId: string;
}) {
  const bookmark = await loadApplicationBookmark(input);
  if (!bookmark) return null;
  await publisher.publish(getUserChannel(input.userId), {
    source: "bookmark",
    chunk: { type: "bookmark-upsert", bookmark },
  });
  return bookmark;
}

export async function publishBookmarkUpsertBatch(input: {
  userId: string;
  bookmarks: ApplicationBookmark[];
}) {
  for (let index = 0; index < input.bookmarks.length; index += 50) {
    // Each event is bounded so publisher and SSE buffers cannot accumulate a
    // single library-sized payload.
    // react-doctor-disable-next-line react-doctor/async-await-in-loop
    await publisher.publish(getUserChannel(input.userId), {
      source: "bookmark",
      chunk: {
        type: "bookmark-upsert-batch",
        bookmarks: input.bookmarks.slice(index, index + 50),
      },
    });
  }
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
