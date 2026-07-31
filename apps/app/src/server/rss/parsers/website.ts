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
import { readFeedHttp } from "../feedHttp";
import { boundFeedItems } from "../feedBounds";
import type { DatabaseFeed } from "~/server/db/schema";
import type {
  ConditionalHeaders,
  FeedFetchMetadata,
  FeedFetchResult,
  NewFeedDetails,
  RSSContent,
} from "../types";
import { captureException, logError } from "~/server/logger";
import { workerPool } from "~/lib/workerPool";

const MAX_OG_IMAGE_FETCHES_PER_FEED = 8;
const OG_IMAGE_FETCH_CONCURRENCY = 2;

function getLongestString(...strings: Array<string | undefined>) {
  return strings.reduce((acc: string, cur) => {
    if (!cur) return acc;
    if (cur.length > acc.length) return cur;
    return acc;
  }, "");
}

const parser = new Parser({
  customFields: {
    feed: [...BASE_FEED_CUSTOM_FIELDS],
    item: [
      "description",
      ["media:content", "mediaContent"],
      ["media:thumbnail", "mediaThumbnail"],
      "enclosure",
    ],
  },
});

const mediaObjectSchema = z
  .object({
    $: z.object({
      url: z.string().optional(),
      medium: z.string().optional(),
      type: z.string().optional(),
    }),
  })
  .optional();

const enclosureSchema = z
  .object({
    url: z.string().optional(),
    type: z.string().optional(),
  })
  .optional();

export const websiteItemSchema = z.object({
  creator: z.string().optional(),
  title: z.string(),
  link: z.string(),
  pubDate: z.string().optional(),
  "content:encoded": z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
  isoDate: z.string().optional(),
  updated: z.string().optional(),
  // ID fields
  guid: z.string().optional(),
  id: z.string().optional(),
  // Image fields
  mediaContent: mediaObjectSchema,
  mediaThumbnail: mediaObjectSchema,
  enclosure: enclosureSchema,
});

function extractThumbnail(
  item: z.infer<typeof websiteItemSchema>,
): string | undefined {
  // Try media:thumbnail first
  if (item.mediaThumbnail?.$.url) {
    return item.mediaThumbnail.$.url;
  }

  // Try media:content if it's an image
  if (item.mediaContent?.$.url) {
    const type = item.mediaContent.$.type ?? "";
    const medium = item.mediaContent.$.medium ?? "";
    if (type.startsWith("image/") || medium === "image") {
      return item.mediaContent.$.url;
    }
  }

  // Try enclosure if it's an image
  if (item.enclosure?.url && item.enclosure.type?.startsWith("image/")) {
    return item.enclosure.url;
  }

  // Try to extract first image from content:encoded or content
  const htmlContent =
    item["content:encoded"] || item.content || item.description || "";
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1]) {
    return imgMatch[1];
  }

  return undefined;
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const response = await readFeedHttp(url, {
      maxBodyBytes: 256 * 1024,
      totalDurationMs: 3_000,
    });

    if (!response.ok) return undefined;

    const html = response.text;

    // Try og:image meta tag
    const ogImageMatch = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    );
    if (ogImageMatch?.[1]) {
      return ogImageMatch[1];
    }

    // Try alternate format (content before property)
    const ogImageAltMatch = html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    );
    if (ogImageAltMatch?.[1]) {
      return ogImageAltMatch[1];
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export const websiteSchema = baseFeedSchema.extend({
  items: websiteItemSchema.array(),
  image: z
    .object({
      link: z.string(),
      url: z.string(),
      title: z.string(),
    })
    .optional(),
  title: z.string(),
  description: z.string().optional(),
  generator: z.string().optional(),
  link: z.string().optional(),
  lastBuildDate: z.string().optional(),
});

export async function getWebsiteFeedIfMatches(
  rssString: string,
  url: string,
): Promise<NewFeedDetails | null> {
  const rssData = await parser.parseString(rssString);

  const {
    data: websiteData,
    success: websiteSuccess,
    error,
  } = websiteSchema.safeParse(rssData);

  if (websiteSuccess) {
    return {
      url: url,
      platform: "website",
      name: websiteData.title,
      imageUrl: websiteData.image?.url,
    };
  } else {
    logError(error);
  }

  return null;
}

export async function fetchWebsiteFeedData(
  feed: DatabaseFeed,
  cached?: ConditionalHeaders,
): Promise<FeedFetchResult | null> {
  try {
    const feedResponse = await readFeedHttp(feed.url, {
      headers: cached ? buildConditionalHeaders(cached) : undefined,
    });

    if (feedResponse.status === 304) {
      return {
        notModified: true,
        fetchMetadata: parseHttpHeaders(feedResponse),
      };
    }

    if (!feedResponse.ok) {
      throw new Error(
        `Failed to fetch website feed: ${feedResponse.status} ${feedResponse.statusText}`,
      );
    }
    const rssData = await parser.parseString(feedResponse.text);

    const data = websiteSchema.parse(rssData);

    // Build fetch metadata from HTTP headers and RSS elements
    const fetchMetadata: FeedFetchMetadata = {
      ...parseHttpHeaders(feedResponse),
      ...extractRssMetadata(data),
    };

    const items = boundFeedItems(
      data.items.flatMap((item) => {
        const id = item.guid || item.id;

        if (!id) return [];

        return [
          {
            id,
            title: item.title,
            publishedDate: item.pubDate || item.isoDate || item.updated || "",
            url: item.link,
            author: item.creator ?? "",
            thumbnail: extractThumbnail(item),
            content: getLongestString(
              item["content:encoded"],
              item.content,
              item.description,
            ),
            contentSnippet: item.contentSnippet,
          } satisfies RSSContent,
        ];
      }),
    );

    const metadataCandidates = items
      .flatMap((item, position) =>
        item.thumbnail ? [] : [{ itemIndex: position, item }],
      )
      .slice(0, MAX_OG_IMAGE_FETCHES_PER_FEED);

    for await (const { itemIndex, thumbnail } of workerPool(
      metadataCandidates,
      OG_IMAGE_FETCH_CONCURRENCY,
      async (candidate) => ({
        itemIndex: candidate.itemIndex,
        thumbnail: await fetchOgImage(candidate.item.url),
      }),
    )) {
      if (thumbnail && items[itemIndex]) {
        items[itemIndex].thumbnail = thumbnail;
      }
    }

    return {
      id: feed.id,
      title: data.title,
      url: data.link ?? new URL(feed.url).origin,
      items,
      fetchMetadata,
    };
  } catch (e) {
    captureException(e, {
      context: "website-feed-fetch",
      feedId: feed.id,
      url: feed.url,
    });
    logError("Error fetching website feed data for URL =", feed.url);
    logError(e);
    return null;
  }
}
