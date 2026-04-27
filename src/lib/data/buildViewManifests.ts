import type { ApplicationFeedItem } from "~/server/db/schema";

type ClientManifestEntry = { id: string; contentHash: string | null };

type BucketedEntries = {
  unread: ClientManifestEntry[];
  read: ClientManifestEntry[];
  later: ClientManifestEntry[];
};

/**
 * Builds per-view, per-visibility-filter manifests from the client's cached
 * feed items. The server uses these manifests to diff against its own data
 * and only send what changed.
 *
 * Items are bucketed by visibility (unread / read / later) so the server
 * doesn't mark e.g. read items as "deleted" during the unread diff.
 *
 * Uses a single pass over feedItemsDict to build a feedId → entries map,
 * then a pass over views to collect entries by feedId — O(items + views × avgFeeds)
 * instead of O(items × views).
 */
export function buildViewManifests(state: {
  feedItemsDict: Record<string, ApplicationFeedItem>;
  viewFeedIds: Record<number, number[]>;
}): Record<number, Record<string, ClientManifestEntry[]>> {
  const { feedItemsDict, viewFeedIds } = state;

  // Single pass: bucket every item by feedId and visibility
  const itemsByFeedId = new Map<number, BucketedEntries>();

  for (const [id, item] of Object.entries(feedItemsDict)) {
    let buckets = itemsByFeedId.get(item.feedId);
    if (!buckets) {
      buckets = { unread: [], read: [], later: [] };
      itemsByFeedId.set(item.feedId, buckets);
    }

    const entry: ClientManifestEntry = {
      id,
      contentHash: item.contentHash ?? null,
    };

    if (item.isWatchLater) {
      buckets.later.push(entry);
    } else if (item.isWatched) {
      buckets.read.push(entry);
    } else {
      buckets.unread.push(entry);
    }
  }

  // Per-view: collect entries from the pre-bucketed map
  const viewManifests: Record<
    number,
    Record<string, ClientManifestEntry[]>
  > = {};

  for (const [viewIdStr, feedIds] of Object.entries(viewFeedIds)) {
    const viewId = Number(viewIdStr);
    const unread: ClientManifestEntry[] = [];
    const read: ClientManifestEntry[] = [];
    const later: ClientManifestEntry[] = [];

    for (const feedId of feedIds) {
      const buckets = itemsByFeedId.get(feedId);
      if (!buckets) continue;
      unread.push(...buckets.unread);
      read.push(...buckets.read);
      later.push(...buckets.later);
    }

    viewManifests[viewId] = { unread, read, later };
  }

  return viewManifests;
}
