import Parser from "rss-parser";
import { z } from "zod";
import { parseHttpHeaders } from "../calculateNextFetch";
import {
  BASE_FEED_CUSTOM_FIELDS,
  baseFeedSchema,
  extractRssMetadata,
} from "../types";
import type { DatabaseFeed } from "~/server/db/schema";
import type {
  FeedFetchMetadata,
  NewFeedDetails,
  RSSContent,
  RSSFeedWithMetadata,
} from "../types";

const parser = new Parser({
  customFields: {
    feed: [...BASE_FEED_CUSTOM_FIELDS],
    item: ["dc:creator"],
  },
});

export const nebulaItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  "dc:creator": z.string().optional(),
  creator: z.string().optional(),
  guid: z.string(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
  isoDate: z.string(),
});

export const nebulaSchema = baseFeedSchema.extend({
  items: nebulaItemSchema.array(),
  feedUrl: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  link: z.string(),
});

function extractThumbnailFromContent(
  content: string | undefined,
): string | undefined {
  if (!content) return undefined;

  // Match img src from the HTML content (handles both quoted and unquoted src)
  const imgMatch = /<img[^>]+src=["']?([^"'\s>]+)/.exec(content);
  return imgMatch?.[1];
}

function convertNebulaUrlToRssUrl(url: string): string {
  if (url.includes("rss.nebula.app")) {
    return url;
  }

  const match = /nebula\.tv\/([^/?]+)/.exec(url);
  if (match?.[1]) {
    return `https://rss.nebula.app/video/channels/${match[1]}.rss`;
  }

  return url;
}

export async function fetchNebulaFeedDetails(
  url: string,
): Promise<NewFeedDetails | null> {
  try {
    const rssUrl = convertNebulaUrlToRssUrl(url);
    const response = await fetch(rssUrl);
    const text = await response.text();
    const rssData = await parser.parseString(text);

    const { data: nebulaData, success } = nebulaSchema.safeParse(rssData);

    if (success) {
      return {
        name: nebulaData.title,
        url: rssUrl,
        platform: "nebula",
      };
    }
  } catch (e) {
    console.error("Error fetching Nebula feed details:", e);
  }

  return null;
}

export async function getNebulaFeedIfMatches(
  rssString: string,
  url: string,
): Promise<NewFeedDetails | null> {
  if (!url.includes("nebula.app") && !url.includes("nebula.tv")) {
    return null;
  }

  try {
    const rssData = await parser.parseString(rssString);
    const { data: nebulaData, success: nebulaSuccess } =
      nebulaSchema.safeParse(rssData);

    if (nebulaSuccess) {
      return {
        name: nebulaData.title,
        url: url,
        platform: "nebula",
      };
    }
  } catch (e) {
    console.error("Error parsing Nebula feed:", e);
  }

  return null;
}

export async function fetchNebulaFeedData(
  feed: DatabaseFeed,
): Promise<RSSFeedWithMetadata | null> {
  try {
    const feedResponse = await fetch(feed.url);
    const text = await feedResponse.text();
    const rssData = await parser.parseString(text);

    const data = nebulaSchema.parse(rssData);

    // Build fetch metadata from HTTP headers and RSS elements
    const fetchMetadata: FeedFetchMetadata = {
      ...parseHttpHeaders(feedResponse),
      ...extractRssMetadata(data),
    };

    return {
      id: feed.id,
      title: data.title,
      url: data.link,
      items: data.items
        .map((item) => {
          const idParts = item.guid.split("/");
          const id = idParts[idParts.length - 1] || item.guid;

          return {
            id,
            title: item.title,
            publishedDate: item.isoDate,
            url: item.link,
            author: item["dc:creator"] ?? item.creator ?? data.title,
            thumbnail: extractThumbnailFromContent(item.content),
            content: item.contentSnippet,
            contentSnippet: item.contentSnippet,
          } satisfies RSSContent;
        })
        .filter(Boolean),
      fetchMetadata,
    };
  } catch (e) {
    console.error("Error fetching Nebula feed data for URL =", feed.url);
    console.error(e);
    return null;
  }
}
