import { checkFeedItemIsVerticalFromUrl } from "../checkFeedItemIsVertical";
import { feedItems } from "../db/schema";
import { buildConflictUpdateColumns } from "../db/utils";
import { fetchNebulaFeedData, fetchNebulaFeedDetails } from "./parsers/nebula";
import { fetchPeerTubeFeedData } from "./parsers/peertube";
import { fetchUnknownRssFeed } from "./parsers/unknown";
import { fetchWebsiteFeedData } from "./parsers/website";
import {
  fetchYouTubeFeedData,
  fetchYouTubeFeedDetails,
} from "./parsers/youtube";
import type { ORPCContext } from "../orpc/base";
import type { ApplicationFeedItem, DatabaseFeed } from "../db/schema";
import type { NewFeedDetails, RSSFeed } from "./types";

export type FetchFeedsStatus = "success" | "empty" | "error";

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
      status: "empty" | "error";
      id: number;
    };

export async function* fetchAndInsertFeedData(
  context: ORPCContext,
  databaseFeeds: DatabaseFeed[],
) {
  const feedIds = databaseFeeds.map((feed) => feed.id);
  const feedPromises = databaseFeeds.map(async (feed): Promise<FeedResult> => {
    try {
      let feedData: RSSFeed | null = null;

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
            title: item.title,
            author: item.author,
            thumbnail: item.thumbnail,
            url: item.url,
            postedAt: new Date(item.publishedDate),
            orientation: checkFeedItemIsVerticalFromUrl(item.url),
          } satisfies typeof feedItems.$inferInsert;
        });

      const feedItemsList = (
        await context.db
          .insert(feedItems)
          .values(feedItemList)
          .onConflictDoUpdate({
            target: [feedItems.url, feedItems.feedId],
            set: buildConflictUpdateColumns(feedItems, [
              "author",
              "content",
              "contentId",
              "createdAt",
              "orientation",
              "postedAt",
              "thumbnail",
              "title",
              "url",
            ]),
          })
          .returning()
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

  while (feedPromises.length > 0) {
    const result = await Promise.any(Array.from(feedPromises));

    const resultIndex = feedIds.findIndex((id) => id === result.id);
    void feedPromises.splice(resultIndex, 1);
    feedIds.splice(resultIndex, 1);

    yield result;
  }

  return;
}
