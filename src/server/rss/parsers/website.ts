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
    const response = await fetch(url);

    if (!response.ok) return undefined;

    const html = await response.text();

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
  link: z.string(),
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
    console.error(error);
  }

  return null;
}

export async function fetchWebsiteFeedData(
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

    const data = websiteSchema.parse(rssData);

    // Build fetch metadata from HTTP headers and RSS elements
    const fetchMetadata: FeedFetchMetadata = {
      ...parseHttpHeaders(feedResponse),
      ...extractRssMetadata(data),
    };

    const itemPromises = data.items.map(async (item) => {
      const id = item.guid || item.id;

      if (!id) return null;

      let thumbnail = extractThumbnail(item);

      // Fetch og:image as last resort if no thumbnail found
      if (!thumbnail) {
        thumbnail = await fetchOgImage(item.link);
      }

      return {
        id,
        title: item.title,
        publishedDate: item.pubDate || item.isoDate || item.updated || "",
        url: item.link,
        author: item.creator ?? "",
        thumbnail,
        content: getLongestString(
          item["content:encoded"],
          item.content,
          item.description,
        ),
        contentSnippet: item.contentSnippet,
      } satisfies RSSContent;
    });

    return {
      id: feed.id,
      title: data.title,
      url: data.link,
      items: (await Promise.all(itemPromises)).filter(Boolean),
      fetchMetadata,
    };
  } catch (e) {
    console.error("Error fetching website feed data for URL =", feed.url);
    console.error(e);
    return null;
  }
}
