import { type feeds } from "../db/schema";
import {
  fetchYouTubeFeedData,
  fetchYouTubeFeedDetails,
} from "./parsers/youtube";
import { type RSSFeed, type NewFeedDetails } from "./types";

export async function fetchNewFeedDetails(
  url: string,
): Promise<NewFeedDetails[]> {
  let urls = [url];

  // process url
  if (url.includes("youtube.com/@")) {
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
        if (url.includes("youtube.com")) {
          return fetchYouTubeFeedDetails(url);
        }
        return null;
      }),
    )
  ).filter(Boolean);

  // get feeds
  return feedDetailList;
}

export async function fetchFeedData(
  databaseFeeds: (typeof feeds.$inferSelect)[],
): Promise<RSSFeed[] | null> {
  return (
    await Promise.all(
      databaseFeeds.map(async (feed) => {
        if (feed.url.includes("youtube.com")) {
          return fetchYouTubeFeedData(feed);
        }
        return null;
      }),
    )
  ).filter(Boolean);
}
