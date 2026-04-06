import { and, eq, inArray } from "drizzle-orm";
import { checkFeedItemIsVerticalFromUrl } from "../checkFeedItemIsVertical";
import { feedItems, feeds } from "../db/schema";
import { buildConflictUpdateColumns } from "../db/utils";
import { logMessage } from "../logger";
import { calculateNextFetch } from "./calculateNextFetch";
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
  RSSFeedWithMetadata,
} from "./types";
import { dbSemaphore } from "~/lib/semaphore";

export type FetchFeedsStatus = "success" | "empty" | "error" | "skipped";

export async function fetchNewFeedDetails(
  url: string,
): Promise<NewFeedDetails[]> {
  let urls = [url];

  // process url
  if (url.includes("youtube.com/@") || url.includes("youtube.com/channel/")) {
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
        if (feedUrl.includes("youtube.com")) {
          return fetchYouTubeFeedDetails(feedUrl);
        }
        if (feedUrl.includes("nebula.tv") || feedUrl.includes("nebula.app")) {
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
    }
  | {
      status: "empty" | "error" | "skipped";
      id: number;
    };

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

      const cached: ConditionalHeaders = {
        etag: feed.etag,
        lastModifiedHeader: feed.lastModifiedHeader,
      };

      let feedData: FeedFetchResult | null = null;

      if (feed.platform === "youtube") {
        feedData = await fetchYouTubeFeedData(feed, cached);
      }
      if (feed.platform === "peertube") {
        feedData = await fetchPeerTubeFeedData(feed, cached);
      }
      if (feed.platform === "nebula") {
        feedData = await fetchNebulaFeedData(feed, cached);
      }
      if (feed.platform === "website") {
        feedData = await fetchWebsiteFeedData(feed, cached);
      }

      if (!feedData) {
        return {
          status: "error",
          id: feed.id,
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

      // Calculate next fetch time and update feed timestamps + conditional headers
      const nextFetchAt = calculateNextFetch(completedFeed.fetchMetadata, now);
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

      if (!completedFeed.items.length) {
        return {
          status: "empty",
          id: feed.id,
        };
      }

      const feedItemList: Array<typeof feedItems.$inferInsert> =
        completedFeed.items.map((item) => {
          return {
            feedId: feed.id,
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
        });

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
            and(
              eq(feedItems.feedId, feed.id),
              inArray(feedItems.url, incomingUrls),
            ),
          )
          .all(),
      );

      const existingByUrl = new Map(
        existingItems.map((item) => [item.url, item]),
      );

      const changedItems = feedItemListWithHash.filter((incoming) => {
        const existing = existingByUrl.get(incoming.url);
        if (!existing) return true; // new item
        // null hash means pre-migration row — force re-write to populate hash
        return existing.contentHash !== incoming.contentHash;
      });

      if (changedItems.length === 0) {
        return {
          status: "success",
          feedItems: [],
          id: feed.id,
        };
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

      const applicationFeedItems = feedItemsList.map((item) => {
        const itemFeed = databaseFeeds.find((f) => f.id === item.feedId);

        return {
          ...item,
          platform: itemFeed?.platform ?? "youtube",
        } as ApplicationFeedItem;
      });

      return {
        status: "success",
        feedItems: applicationFeedItems,
        id: feed.id,
      };
    } catch {
      return {
        status: "error",
        id: feed.id,
      };
    }
  });

  let cachedCount = 0;
  let fetchedCount = 0;
  const totalFeeds = databaseFeeds.length;
  const fetchedFeedNames: string[] = [];

  while (feedPromises.length > 0) {
    const result = await Promise.any(Array.from(feedPromises));

    const resultIndex = feedIds.findIndex((id) => id === result.id);
    void feedPromises.splice(resultIndex, 1);
    feedIds.splice(resultIndex, 1);

    if (result.status === "skipped") {
      cachedCount++;
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
    const cachedPercent = ((cachedCount / totalFeeds) * 100).toFixed(1);
    logMessage(
      `[Feed Fetch] ${cachedCount} cached, ${fetchedCount} fetched (${cachedPercent}% cached) out of ${totalFeeds} feeds`,
    );
  }

  return;
}
