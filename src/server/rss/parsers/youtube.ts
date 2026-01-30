import Parser from "rss-parser";
import { z } from "zod";
import { parseHttpHeaders } from "../calculateNextFetch";
import {
  BASE_FEED_CUSTOM_FIELDS,
  baseFeedSchema,
  extractRssMetadata,
} from "../types";
import type { feeds } from "~/server/db/schema";
import type {
  FeedFetchMetadata,
  NewFeedDetails,
  RSSContent,
  RSSFeedWithMetadata,
} from "../types";

const parser = new Parser({
  customFields: {
    feed: [...BASE_FEED_CUSTOM_FIELDS],
    item: ["media:group"],
  },
});

const youtubeItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string().optional(),
  author: z.string(),
  id: z.string(),
  isoDate: z.string(),
  "media:group": z.object({
    "media:thumbnail": z.array(
      z.object({
        $: z.object({
          url: z.string(),
        }),
      }),
    ),
    "media:description": z.array(z.string()),
  }),
});

const youtubeSchema = baseFeedSchema.extend({
  link: z.string(),
  feedUrl: z.string().optional(),
  title: z.string(),
  items: z.array(youtubeItemSchema),
});

export async function fetchYouTubeFeedDetails(
  url: string,
): Promise<NewFeedDetails | null> {
  const rssData = await parser.parseURL(url);
  const data = youtubeSchema.parse(rssData);

  return {
    name: data.title,
    url: url,
    platform: "youtube",
  };
}

export async function fetchYouTubeFeedData(
  feed: typeof feeds.$inferSelect,
): Promise<RSSFeedWithMetadata | null> {
  try {
    const feedResponse = await fetch(feed.url);
    const text = await feedResponse.text();
    const rssData = await parser.parseString(text);
    const data = youtubeSchema.parse(rssData);

    // Build fetch metadata from HTTP headers and RSS elements
    const fetchMetadata: FeedFetchMetadata = {
      ...parseHttpHeaders(feedResponse),
      ...extractRssMetadata(data),
    };

    return {
      id: feed.id,
      title: data.title,
      url: data.link,
      items: data.items.map((item) => {
        const thumbnail = item["media:group"]["media:thumbnail"][0]?.$.url;
        const description = item["media:group"]["media:description"][0];

        return {
          id: item.id.replace("yt:video:", ""),
          title: item.title,
          publishedDate: item.isoDate,
          url: item.link,
          author: item.author,
          thumbnail: thumbnail,
          content: description,
          contentSnippet: description,
        } satisfies RSSContent;
      }),
      fetchMetadata,
    };
  } catch {
    return null;
  }
}
