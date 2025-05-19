import type { DatabaseFeed } from "../db/schema";
import { fetchPeerTubeFeedData } from "./parsers/peertube";
import { fetchUnknownRssFeed } from "./parsers/unknown";
import {
  fetchYouTubeFeedData,
  fetchYouTubeFeedDetails,
} from "./parsers/youtube";
import { type NewFeedDetails, type RSSFeed } from "./types";

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
      .map((id) => id?.[1])
      .filter(Boolean);
  }

  const feedDetailList = (
    await Promise.all(
      urls.map(async (url) => {
        console.log(url);
        if (url.includes("youtube.com")) {
          return fetchYouTubeFeedDetails(url);
        }
        return fetchUnknownRssFeed(url);
      }),
    )
  ).filter(Boolean);

  // get feeds
  return feedDetailList;
}

export async function fetchFeedData(
  databaseFeeds: DatabaseFeed[],
): Promise<RSSFeed[] | null> {
  return (
    await Promise.all(
      databaseFeeds.map(async (feed) => {
        if (feed.platform === "youtube") {
          return fetchYouTubeFeedData(feed);
        }
        if (feed.platform === "peertube") {
          return fetchPeerTubeFeedData(feed);
        }
        return null;
      }),
    )
  ).filter(Boolean);
}
