import { createHash } from "node:crypto";
import { z } from "zod";
import type { FeedFetchMetadata, RSSFeedWithMetadata } from "./types";
import { getKV } from "~/server/kv";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * ONE_HOUR_MS;
const DEFAULT_INTERVAL_MS = ONE_HOUR_MS;
const ERROR_BACKOFF_MS = 60 * 60 * 1000;

const feedFetchMetadataSchema = z.object({
  etag: z.string().optional(),
  lastModified: z.string().optional(),
  cacheControlMaxAge: z.number().optional(),
  expires: z.coerce.date().optional(),
  ttl: z.number().optional(),
  updatePeriod: z
    .enum(["hourly", "daily", "weekly", "monthly", "yearly"])
    .optional(),
  updateFrequency: z.number().optional(),
});

const rssContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  publishedDate: z.string(),
  author: z.string(),
  url: z.string(),
  thumbnail: z.string().optional(),
  content: z.string().optional(),
  contentSnippet: z.string().optional(),
  source: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      link: z.string().optional(),
      feedUrl: z.string().optional(),
      image: z
        .object({
          link: z.string().optional(),
          url: z.string().optional(),
          title: z.string().optional(),
          width: z.string().optional(),
          height: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const cachedFeedResultSchema = z.union([
  z.object({
    status: z.literal("success"),
    data: z.object({
      title: z.string(),
      url: z.string(),
      items: z.array(rssContentSchema),
      fetchMetadata: feedFetchMetadataSchema,
    }),
  }),
  z.object({
    status: z.literal("empty"),
    fetchMetadata: feedFetchMetadataSchema,
  }),
  z.object({
    status: z.literal("error"),
    message: z.string(),
    fetchMetadata: feedFetchMetadataSchema.optional(),
  }),
]);

export type CachedFeedResult =
  | {
      status: "success";
      data: Omit<RSSFeedWithMetadata, "id">;
    }
  | {
      status: "empty";
      fetchMetadata: FeedFetchMetadata;
    }
  | {
      status: "error";
      fetchMetadata?: FeedFetchMetadata;
      message: string;
    };

/**
 * Normalize a feed URL so that trailing slashes are stripped and the
 * string is canonical. Two URLs that differ only by a trailing slash
 * will produce the same normalized string.
 */
export function normalizeFeedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip trailing slash from pathname, but preserve root "/"
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    // Sort search params for stability
    parsed.searchParams.sort();
    return parsed.toString();
  } catch {
    // If URL parsing fails, fall back to a simple trailing-slash strip
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }
}

/**
 * Build a stable cache key for a feed URL.
 */
export function getFeedCacheKey(url: string): string {
  const normalized = normalizeFeedUrl(url);
  const hash = createHash("sha256").update(normalized).digest("hex");
  return `feed:rss:${hash}`;
}

/**
 * Calculate how many seconds a feed result should be cached.
 */
export function getFeedCacheTtlSeconds(
  status: CachedFeedResult["status"],
  fetchMetadata?: FeedFetchMetadata,
): number {
  if (status === "error") {
    return Math.floor(ERROR_BACKOFF_MS / 1000);
  }

  if (fetchMetadata?.ttl !== undefined && fetchMetadata.ttl > 0) {
    return Math.min(fetchMetadata.ttl * 60, Math.floor(MAX_INTERVAL_MS / 1000));
  }

  return Math.floor(DEFAULT_INTERVAL_MS / 1000);
}

/**
 * Read a cached feed result from the global KV store.
 */
export async function getCachedFeedResult(
  url: string,
): Promise<CachedFeedResult | null> {
  const key = getFeedCacheKey(url);
  const kv = await getKV();
  const raw = await kv.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const validated = cachedFeedResultSchema.parse(parsed);
    return validated;
  } catch {
    return null;
  }
}

/**
 * Write a feed result to the global KV store.
 */
export async function setCachedFeedResult(
  url: string,
  result: CachedFeedResult,
): Promise<void> {
  const key = getFeedCacheKey(url);
  const kv = await getKV();

  const fetchMetadata =
    result.status === "success"
      ? result.data.fetchMetadata
      : result.status === "empty"
        ? result.fetchMetadata
        : result.fetchMetadata;

  const ttlSeconds = getFeedCacheTtlSeconds(result.status, fetchMetadata);

  await kv.set(key, JSON.stringify(result), ttlSeconds);
}
