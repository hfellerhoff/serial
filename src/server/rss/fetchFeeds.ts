import { eq } from "drizzle-orm";
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
import type { ApplicationFeedItem, DatabaseFeed } from "../db/schema";
import type { db as Database } from "../db";
import type { NewFeedDetails, RSSFeedWithMetadata } from "./types";
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

      let feedData: RSSFeedWithMetadata | null = null;

      if (feed.platform === "youtube") {
        feedData = await fetchYouTubeFeedData(feed);
      }
      if (feed.platform === "peertube") {
        feedData = await fetchPeerTubeFeedData(feed);
      }
      if (feed.platform === "nebula") {
        feedData = await fetchNebulaFeedData(feed);
      }
      if (feed.platform === "website") {
        feedData = await fetchWebsiteFeedData(feed);
      }

      if (!feedData) {
        return {
          status: "error",
          id: feed.id,
        };
      }

      // Calculate next fetch time and update feed timestamps
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

      if (!feedData.items.length) {
        return {
          status: "empty",
          id: feed.id,
        };
      }

      const feedItemList: Array<typeof feedItems.$inferInsert> =
        feedData.items.map((item) => {
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

      const feedItemsList = (
        await dbSemaphore.run(() =>
          context.db
            .insert(feedItems)
            .values(feedItemList)
            .onConflictDoUpdate({
              target: [feedItems.url, feedItems.feedId],
              set: buildConflictUpdateColumns(feedItems, [
                "author",
                "content",
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
