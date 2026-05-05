import { and, eq, inArray } from "drizzle-orm";
import { checkFeedItemIsVerticalFromUrl } from "../checkFeedItemIsVertical";
import { feedItems, feeds } from "../db/schema";
import { buildConflictUpdateColumns } from "../db/utils";
import { logMessage } from "../logger";
import { calculateNextFetch } from "./calculateNextFetch";
import { getCachedFeedResult, setCachedFeedResult } from "./feedCache";
import { fetchNebulaFeedData, fetchNebulaFeedDetails } from "./parsers/nebula";
import { fetchPeerTubeFeedData } from "./parsers/peertube";
import { fetchUnknownRssFeed } from "./parsers/unknown";
import { fetchWebsiteFeedData } from "./parsers/website";
import {
  fetchYouTubeFeedData,
  fetchYouTubeFeedDetails,
} from "./parsers/youtube";
import { computeItemHash } from "./hash";
import type { ApplicationFeedItem, DatabaseFeed } from "../db/schema";
import type { db as Database } from "../db";
import type {
  ConditionalHeaders,
  FeedFetchResult,
  NewFeedDetails,
  RSSContent,
  RSSFeedWithMetadata,
} from "./types";
import { env } from "~/env";
import { dbSemaphore } from "~/lib/semaphore";

/** How long to back off a feed after a fetch error, to avoid cascading retries. */
const ERROR_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

export type FetchFeedsStatus = "success" | "empty" | "error" | "skipped";

function assertValidFeedUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error("Invalid URL", { cause: e });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL protocol");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    (env.NODE_ENV === "production" && hostname === "localhost") ||
    hostname.endsWith(".localhost")
  ) {
    throw new Error("Localhost URLs are not allowed");
  }
  if (
    env.NODE_ENV === "production" &&
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  ) {
    throw new Error("Feeds hosted on IPV4 addresses are not allowed");
  }
}

export async function fetchNewFeedDetails(
  url: string,
): Promise<NewFeedDetails[]> {
  assertValidFeedUrl(url);

  let urls = [url];

  // process url
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();
  const isYouTubeHost =
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname.endsWith(".youtube.com");

  if (
    isYouTubeHost &&
    (url.includes("youtube.com/@") || url.includes("youtube.com/channel/"))
  ) {
    const feed = await fetch(url);
    const text = await feed.text();

    const rssFeedUrlMatches = text.matchAll(
      /<link rel="alternate" type="application\/rss\+xml" title="RSS" href="(https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=[^&]{24})">/gm,
    );

    urls = Array.from(rssFeedUrlMatches)
      .map((id) => id[1])
      .filter(Boolean);
  }

  const feedDetailList = (
    await Promise.all(
      urls.map(async (feedUrl) => {
        assertValidFeedUrl(feedUrl);
        const feedHostname = new URL(feedUrl).hostname.toLowerCase();
        const isYouTube =
          feedHostname === "youtube.com" ||
          feedHostname === "www.youtube.com" ||
          feedHostname.endsWith(".youtube.com");
        if (isYouTube) {
          return fetchYouTubeFeedDetails(feedUrl);
        }
        if (
          feedHostname === "nebula.tv" ||
          feedHostname === "nebula.app" ||
          feedHostname.endsWith(".nebula.tv") ||
          feedHostname.endsWith(".nebula.app")
        ) {
          return fetchNebulaFeedDetails(feedUrl);
        }
        return fetchUnknownRssFeed(feedUrl);
      }),
    )
  ).filter(Boolean);

  // get feeds
  return feedDetailList;
}

type FeedResult =
  | {
      status: "success";
      feedItems: ApplicationFeedItem[];
      id: number;
      fromCache?: boolean;
    }
  | {
      status: "empty" | "skipped";
      id: number;
      fromCache?: boolean;
    }
  | {
      status: "error";
      id: number;
      error: unknown;
      fromCache?: boolean;
    };

async function insertFeedItems(
  context: { db: typeof Database },
  feedId: number,
  items: RSSContent[],
  databaseFeeds: DatabaseFeed[],
): Promise<ApplicationFeedItem[]> {
  if (!items.length) {
    return [];
  }

  const feedItemList: Array<typeof feedItems.$inferInsert> = items.map(
    (item) => {
      return {
        feedId,
        contentId: item.id,
        content: item.content,
        contentSnippet: item.contentSnippet,
        title: item.title,
        author: item.author,
        thumbnail: item.thumbnail,
        url: item.url,
        postedAt: new Date(item.publishedDate),
        orientation: checkFeedItemIsVerticalFromUrl(item.url),
      } satisfies typeof feedItems.$inferInsert;
    },
  );

  // Compute content hash for each incoming item
  const feedItemListWithHash = feedItemList.map((item) => ({
    ...item,
    contentHash: computeItemHash(item),
  }));

  // Diff against existing hashes to avoid unnecessary writes.
  const incomingUrls = feedItemListWithHash.map((item) => item.url);
  const existingItems = await dbSemaphore.run(() =>
    context.db
      .select({
        url: feedItems.url,
        contentHash: feedItems.contentHash,
      })
      .from(feedItems)
      .where(
        and(eq(feedItems.feedId, feedId), inArray(feedItems.url, incomingUrls)),
      )
      .all(),
  );

  const existingByUrl = new Map(existingItems.map((item) => [item.url, item]));

  const changedItems = feedItemListWithHash.filter((incoming) => {
    const existing = existingByUrl.get(incoming.url);
    if (!existing) return true; // new item
    // null hash means pre-migration row — force re-write to populate hash
    return existing.contentHash !== incoming.contentHash;
  });

  if (changedItems.length === 0) {
    return [];
  }

  const feedItemsList = (
    await dbSemaphore.run(() =>
      context.db
        .insert(feedItems)
        .values(changedItems)
        .onConflictDoUpdate({
          target: [feedItems.url, feedItems.feedId],
          set: buildConflictUpdateColumns(feedItems, [
            "author",
            "content",
            "contentHash",
            "contentId",
            "contentSnippet",
            "createdAt",
            "orientation",
            "postedAt",
            "thumbnail",
            "title",
            "url",
          ]),
        })
        .returning(),
    )
  )
    .filter(Boolean)
    .flat();

  return feedItemsList.map((item) => {
    const itemFeed = databaseFeeds.find((f) => f.id === item.feedId);

    return {
      ...item,
      platform: itemFeed?.platform ?? "youtube",
    } as ApplicationFeedItem;
  });
}

export async function* fetchAndInsertFeedData(
  context: { db: typeof Database },
  databaseFeeds: DatabaseFeed[],
) {
  const feedIds = databaseFeeds.map((feed) => feed.id);
  const now = new Date();

  const feedPromises = databaseFeeds.map(async (feed): Promise<FeedResult> => {
    try {
      // Check if we should skip this feed based on nextFetchAt
      if (feed.nextFetchAt && feed.nextFetchAt > now) {
        return {
          status: "skipped",
          id: feed.id,
        };
      }

      if (!feed.isActive) {
        return {
          status: "skipped",
          id: feed.id,
        };
      }

      // Check cross-user cache
      const cachedResult = await getCachedFeedResult(feed.url);

      if (cachedResult) {
        if (cachedResult.status === "error") {
          const errorBackoffAt = new Date(now.getTime() + ERROR_BACKOFF_MS);
          await dbSemaphore.run(() =>
            context.db
              .update(feeds)
              .set({ nextFetchAt: errorBackoffAt })
              .where(eq(feeds.id, feed.id)),
          );
          return {
            status: "error",
            id: feed.id,
            error: new Error(cachedResult.message),
            fromCache: true,
          };
        }

        if (cachedResult.status === "empty") {
          const nextFetchAt = calculateNextFetch(
            cachedResult.fetchMetadata,
            now,
          );
          await dbSemaphore.run(() =>
            context.db
              .update(feeds)
              .set({
                lastFetchedAt: now,
                nextFetchAt,
                etag: cachedResult.fetchMetadata.etag ?? null,
                lastModifiedHeader:
                  cachedResult.fetchMetadata.lastModified ?? null,
              })
              .where(eq(feeds.id, feed.id)),
          );
          return {
            status: "empty",
            id: feed.id,
            fromCache: true,
          };
        }

        // cached success
        const nextFetchAt = calculateNextFetch(
          cachedResult.data.fetchMetadata,
          now,
        );
        await dbSemaphore.run(() =>
          context.db
            .update(feeds)
            .set({
              lastFetchedAt: now,
              nextFetchAt,
              etag: cachedResult.data.fetchMetadata.etag ?? null,
              lastModifiedHeader:
                cachedResult.data.fetchMetadata.lastModified ?? null,
            })
            .where(eq(feeds.id, feed.id)),
        );

        const applicationFeedItems = await insertFeedItems(
          context,
          feed.id,
          cachedResult.data.items,
          databaseFeeds,
        );

        return {
          status: "success",
          feedItems: applicationFeedItems,
          id: feed.id,
          fromCache: true,
        };
      }

      // Cache miss — proceed with HTTP fetch
      const cached: ConditionalHeaders = {
        etag: feed.etag,
        lastModifiedHeader: feed.lastModifiedHeader,
      };

      let feedData: FeedFetchResult | null = null;

      if (feed.platform === "youtube") {
        feedData = await fetchYouTubeFeedData(feed, cached);
      } else if (feed.platform === "peertube") {
        feedData = await fetchPeerTubeFeedData(feed, cached);
      } else if (feed.platform === "nebula") {
        feedData = await fetchNebulaFeedData(feed, cached);
      } else if (feed.platform === "website") {
        feedData = await fetchWebsiteFeedData(feed, cached);
      }

      if (!feedData) {
        const errorBackoffAt = new Date(now.getTime() + ERROR_BACKOFF_MS);
        await dbSemaphore.run(() =>
          context.db
            .update(feeds)
            .set({ nextFetchAt: errorBackoffAt })
            .where(eq(feeds.id, feed.id)),
        );
        const error = new Error(
          `No feed data returned for platform: ${feed.platform}`,
        );
        await setCachedFeedResult(feed.url, {
          status: "error",
          message: error.message,
        });
        return {
          status: "error",
          id: feed.id,
          error,
        };
      }

      // Handle 304 Not Modified — skip insert, just update timestamps
      if ("notModified" in feedData && feedData.notModified) {
        const nextFetchAt = calculateNextFetch(feedData.fetchMetadata, now);
        await dbSemaphore.run(() =>
          context.db
            .update(feeds)
            .set({
              lastFetchedAt: now,
              nextFetchAt: nextFetchAt,
            })
            .where(eq(feeds.id, feed.id)),
        );
        return {
          status: "skipped",
          id: feed.id,
        };
      }

      // At this point feedData is a full RSSFeedWithMetadata (not notModified)
      const completedFeed = feedData as RSSFeedWithMetadata;

      if (!completedFeed.items.length) {
        await setCachedFeedResult(feed.url, {
          status: "empty",
          fetchMetadata: completedFeed.fetchMetadata,
        });
        const nextFetchAt = calculateNextFetch(
          completedFeed.fetchMetadata,
          now,
        );
        await dbSemaphore.run(() =>
          context.db
            .update(feeds)
            .set({
              lastFetchedAt: now,
              nextFetchAt: nextFetchAt,
              etag: completedFeed.fetchMetadata.etag ?? null,
              lastModifiedHeader:
                completedFeed.fetchMetadata.lastModified ?? null,
            })
            .where(eq(feeds.id, feed.id)),
        );
        return {
          status: "empty",
          id: feed.id,
        };
      }

      await setCachedFeedResult(feed.url, {
        status: "success",
        data: {
          title: completedFeed.title,
          url: completedFeed.url,
          items: completedFeed.items,
          fetchMetadata: completedFeed.fetchMetadata,
        },
      });

      const nextFetchAt = calculateNextFetch(completedFeed.fetchMetadata, now);
      await dbSemaphore.run(() =>
        context.db
          .update(feeds)
          .set({
            lastFetchedAt: now,
            nextFetchAt,
            etag: completedFeed.fetchMetadata.etag ?? null,
            lastModifiedHeader:
              completedFeed.fetchMetadata.lastModified ?? null,
          })
          .where(eq(feeds.id, feed.id)),
      );

      const applicationFeedItems = await insertFeedItems(
        context,
        feed.id,
        completedFeed.items,
        databaseFeeds,
      );

      return {
        status: "success",
        feedItems: applicationFeedItems,
        id: feed.id,
      };
    } catch (e) {
      // Push back nextFetchAt so a broken feed isn't retried every minute
      const errorBackoffAt = new Date(now.getTime() + ERROR_BACKOFF_MS);
      try {
        await dbSemaphore.run(() =>
          context.db
            .update(feeds)
            .set({ nextFetchAt: errorBackoffAt })
            .where(eq(feeds.id, feed.id)),
        );
      } catch {
        // Best-effort — don't let the backoff update mask the original error
      }
      await setCachedFeedResult(feed.url, {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
      return {
        status: "error",
        id: feed.id,
        error: e,
      };
    }
  });

  let skippedCount = 0;
  let crossUserCacheCount = 0;
  let fetchedCount = 0;
  const totalFeeds = databaseFeeds.length;
  const fetchedFeedNames: string[] = [];

  while (feedPromises.length > 0) {
    const result = await Promise.any(Array.from(feedPromises));

    const resultIndex = feedIds.findIndex((id) => id === result.id);
    void feedPromises.splice(resultIndex, 1);
    feedIds.splice(resultIndex, 1);

    if (result.status === "skipped") {
      skippedCount++;
    } else if (result.fromCache) {
      crossUserCacheCount++;
    } else {
      fetchedCount++;
      const feedName = databaseFeeds.find((f) => f.id === result.id)?.name;
      if (feedName) {
        fetchedFeedNames.push(feedName);
      }
    }

    yield result;
  }

  // Log fetch statistics
  if (totalFeeds > 0) {
    const cacheHitPercent = ((crossUserCacheCount / totalFeeds) * 100).toFixed(
      1,
    );
    logMessage(
      `[Feed Fetch] ${skippedCount} skipped, ${crossUserCacheCount} cross-user cached (${cacheHitPercent}%), ${fetchedCount} fetched out of ${totalFeeds} feeds`,
    );
  }

  return;
}
