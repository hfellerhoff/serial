import type { ApplicationBookmark } from "~/server/mixed-content/projection";

export const BOOKMARK_SYNC_BUCKET_COUNT = 64;
export const BOOKMARK_SYNC_PAGE_SIZE = 50;
export const BOOKMARK_SYNC_REQUEST_BUDGET_BYTES = 16 * 1_024;
export const BOOKMARK_SYNC_RESPONSE_BUDGET_BYTES = 256 * 1_024;

export type BookmarkSyncManifestEntry = {
  bucket: number;
  version: string;
};

export function bookmarkManifestValue(bookmark: ApplicationBookmark) {
  return [
    bookmark.updatedAt.toISOString(),
    bookmark.savedUpdatedAt.toISOString(),
    bookmark.readUpdatedAt.toISOString(),
    bookmark.progressUpdatedAt.toISOString(),
    bookmark.captureHash ?? "",
    bookmark.capturedAt?.toISOString() ?? "",
    bookmark.viewIds.join(","),
    bookmark.tagIds.join(","),
  ].join("|");
}

function fnv1a64(value: string) {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function getBookmarkSyncBucket(id: string) {
  const hash = Number.parseInt(fnv1a64(id).slice(-8), 16);
  return hash % BOOKMARK_SYNC_BUCKET_COUNT;
}

export function bookmarkSyncBucketVersion(bookmarks: ApplicationBookmark[]) {
  const value = bookmarks
    .map((bookmark) => `${bookmark.id}\0${bookmarkManifestValue(bookmark)}`)
    .sort()
    .join("\n");
  return fnv1a64(value);
}

export function buildBookmarkSyncBuckets(bookmarks: ApplicationBookmark[]) {
  const buckets = Array.from(
    { length: BOOKMARK_SYNC_BUCKET_COUNT },
    () => [] as ApplicationBookmark[],
  );
  for (const bookmark of bookmarks) {
    buckets[getBookmarkSyncBucket(bookmark.id)]!.push(bookmark);
  }
  for (const bucket of buckets) {
    bucket.sort((left, right) => left.id.localeCompare(right.id));
  }
  return buckets;
}

export function buildBookmarkSyncManifest(
  bookmarks: ApplicationBookmark[],
): BookmarkSyncManifestEntry[] {
  return buildBookmarkSyncBuckets(bookmarks).map((bucket, index) => ({
    bucket: index,
    version: bookmarkSyncBucketVersion(bucket),
  }));
}
