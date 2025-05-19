import Parser from "rss-parser";
import { type RSSFeed, type NewFeedDetails, type RSSContent } from "../types";
import { type feeds } from "~/server/db/schema";
import { isWithinDays } from "../rssUtils";

const parser = new Parser({
  customFields: {
    item: ["media:group"],
  },
});

type RSSYoutubeData = {
  link: string;
  feedUrl: string;
  title: string;
  items: {
    title: string;
    link: string;
    pubDate: string;
    author: string;
    id: string;
    isoDate: string;
    "media:group": {
      "media:thumbnail": {
        $: {
          url: string;
        };
      }[];
      "media:description": string[];
    };
  }[];
};

export async function fetchYouTubeFeedDetails(
  url: string,
): Promise<NewFeedDetails | null> {
  const data = (await parser.parseURL(url)) as unknown as RSSYoutubeData;

  return {
    name: data.title,
    url: url,
    platform: "youtube",
  };
}

export async function fetchYouTubeFeedData(
  feed: typeof feeds.$inferSelect,
): Promise<RSSFeed | null> {
  try {
    const data = (await parser.parseURL(feed.url)) as unknown as RSSYoutubeData;

    return {
      id: feed.id,
      title: data.title,
      url: data.link,
      items: data.items
        .filter((item) => isWithinDays(item.pubDate, 60))
        .map((item) => {
          // @ts-expect-error deal with later
          const thumbnail = item["media:group"]["media:thumbnail"][0].$.url;
          const description = item["media:group"]["media:description"][0];

          return {
            id: item.id.replace("yt:video:", ""),
            // type: "video",
            // platform: "youtube",
            // category: feed.category,
            title: item.title,
            publishedDate: item.isoDate,
            url: item.link,
            author: item.author,
            thumbnail: thumbnail,
            content: description,
          } satisfies RSSContent;
        }),
    };
  } catch {
    return null;
  }
}
