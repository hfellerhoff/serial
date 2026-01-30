import { z } from "zod";
import type { FeedPlatform, feeds } from "~/server/db/schema";

export type NewFeedDetails = Omit<
  typeof feeds.$inferInsert,
  "id" | "createdAt" | "updatedAt" | "userId"
> & {
  platform: FeedPlatform;
};

export type RSSContent = {
  id: string;
  // type: ContentType;
  // platform: RSSPlatform;
  // category: ContentCategory;
  title: string;
  subtitle?: string;
  publishedDate: string;
  author: string;
  url: string;
  thumbnail?: string;
  content?: string;
  contentSnippet?: string;
  source?: {
    title?: string;
    description?: string;
    link?: string;
    feedUrl?: string;
    image?: {
      link?: string;
      url?: string;
      title?: string;
      width?: string;
      height?: string;
    };
  };
};

export type RSSFeed = {
  id: number;
  url: string;
  title: string;
  items: RSSContent[];
};

export type FeedFetchMetadata = {
  // HTTP headers
  etag?: string;
  lastModified?: string;
  cacheControlMaxAge?: number; // seconds
  expires?: Date;

  // RSS 2.0 elements
  ttl?: number; // minutes

  // Syndication module (sy:)
  updatePeriod?: "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  updateFrequency?: number;
};

export type RSSFeedWithMetadata = RSSFeed & {
  fetchMetadata: FeedFetchMetadata;
};

/**
 * Base schema for RSS feed-level metadata fields.
 * All parser schemas should extend this to capture caching hints.
 */
const trimmedUpdatePeriod = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z.enum(["hourly", "daily", "weekly", "monthly", "yearly"]),
);

export const baseFeedSchema = z.object({
  ttl: z.string().optional(),
  "sy:updatePeriod": trimmedUpdatePeriod.optional(),
  "sy:updateFrequency": z.string().optional(),
});

/**
 * Custom fields configuration for rss-parser to capture feed-level metadata.
 * Use this in parser configuration: customFields: { feed: BASE_FEED_CUSTOM_FIELDS, ... }
 */
export const BASE_FEED_CUSTOM_FIELDS = [
  "ttl",
  "sy:updatePeriod",
  "sy:updateFrequency",
] as const;

/**
 * Extract RSS metadata fields from parsed feed data into FeedFetchMetadata format.
 */
export function extractRssMetadata(
  data: z.infer<typeof baseFeedSchema>,
): Partial<FeedFetchMetadata> {
  const metadata: Partial<FeedFetchMetadata> = {};

  if (data.ttl) {
    const ttlNum = parseInt(data.ttl, 10);
    if (!isNaN(ttlNum)) {
      metadata.ttl = ttlNum;
    }
  }

  if (data["sy:updatePeriod"]) {
    metadata.updatePeriod = data["sy:updatePeriod"];
  }

  if (data["sy:updateFrequency"]) {
    const freq = parseInt(data["sy:updateFrequency"], 10);
    if (!isNaN(freq)) {
      metadata.updateFrequency = freq;
    }
  }

  return metadata;
}
