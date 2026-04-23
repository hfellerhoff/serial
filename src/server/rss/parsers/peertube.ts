import Parser from "rss-parser";
import { z } from "zod";
import {
  buildConditionalHeaders,
  parseHttpHeaders,
} from "../calculateNextFetch";
import {
  BASE_FEED_CUSTOM_FIELDS,
  baseFeedSchema,
  extractRssMetadata,
} from "../types";
import type { DatabaseFeed } from "~/server/db/schema";
import type {
  ConditionalHeaders,
  FeedFetchMetadata,
  FeedFetchResult,
  NewFeedDetails,
  RSSContent,
} from "../types";
import { captureException } from "~/server/logger";

const parser = new Parser({
  customFields: {
    feed: [...BASE_FEED_CUSTOM_FIELDS],
    item: ["media:group", "media:thumbnail", "media:description"],
  },
});

export const peerTubeItemSchema = z.object({
  creator: z.string(),
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  "dc:creator": z.string(),
  guid: z.string(),
  "media:thumbnail": z.object({
    $: z.object({
      url: z.string(),
    }),
  }),
  "media:description": z.string().optional(),
  isoDate: z.string(),
});

export const peerTubeSchema = baseFeedSchema.extend({
  items: peerTubeItemSchema.array(),
  feedUrl: z.string(),
  image: z.object({
    link: z.string(),
    url: z.string(),
    title: z.string(),
  }),
  // paginationLinks:
  title: z.string(),
  description: z.string(),
  generator: z.string().includes("PeerTube -"),
  link: z.string(),
  copyright: z.string(),
  lastBuildDate: z.string(),
  docs: z.string(),
});

export async function getPeerTubeFeedIfMatches(
  rssString: string,
): Promise<NewFeedDetails | null> {
  const rssData = await parser.parseString(rssString); // as unknown as RSSPeerTubeData;

  const {
    data: peerTubeData,
    success: peerTubeSuccess,
    error,
  } = peerTubeSchema.safeParse(rssData);

  if (peerTubeSuccess) {
    return {
      name: peerTubeData.title,
      url: peerTubeData.feedUrl,
      platform: "peertube",
    };
  } else {
    console.error(error);
  }

  return null;
}

export async function fetchPeerTubeFeedData(
  feed: DatabaseFeed,
  cached?: ConditionalHeaders,
): Promise<FeedFetchResult | null> {
  try {
    const feedResponse = await fetch(feed.url, {
      headers: cached ? buildConditionalHeaders(cached) : undefined,
    });

    if (feedResponse.status === 304) {
      return {
        notModified: true,
        fetchMetadata: parseHttpHeaders(feedResponse),
      };
    }

    const text = await feedResponse.text();
    const rssData = await parser.parseString(text);

    const data = peerTubeSchema.parse(rssData);

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
          const id = idParts[idParts.length - 1];

          if (!id) return null;

          return {
            id,
            title: item.title,
            publishedDate: item.isoDate,
            url: item.link,
            author: item.creator,
            thumbnail: item["media:thumbnail"].$.url,
            content: item["media:description"],
            contentSnippet: item["media:description"],
          } satisfies RSSContent;
        })
        .filter(Boolean),
      fetchMetadata,
    };
  } catch (e) {
    captureException(e, {
      context: "peertube-feed-fetch",
      feedId: feed.id,
      url: feed.url,
    });
    console.error("Error fetching PeerTube feed data for URL =", feed.url);
    console.error(e);
    return null;
  }
}
