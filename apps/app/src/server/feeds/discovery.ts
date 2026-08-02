import { discoverFeeds as discoverFeedsFromUrl } from "feedscout";

import { captureLimiter } from "~/server/bookmarks/limits";
import { captureException } from "~/server/logger";
import { readFeedHttp } from "~/server/rss/feedHttp";

export type DiscoveredFeed = {
  url: string;
  title?: string;
  format?: string;
};

async function discoverYouTubeFeeds(url: string) {
  if (!url.includes("youtube.com/@") && !url.includes("youtube.com/channel/")) {
    return null;
  }

  try {
    const response = await readFeedHttp(url);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Failed to fetch YouTube channel page: ${response.status} ${response.statusText}`,
      );
    }
    const text = response.text;
    const rssFeedUrlMatches = text.matchAll(
      /<link rel="alternate" type="application\/rss\+xml" title="RSS" href="(https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=[^&]{24})">/gm,
    );
    const channelName = /<meta property="og:title" content="([^"]+)">/.exec(
      text,
    )?.[1];
    const feedUrls = Array.from(rssFeedUrlMatches).flatMap((match) =>
      match[1] ? [match[1]] : [],
    );

    return feedUrls.length > 0
      ? feedUrls.map((feedUrl) => ({
          url: feedUrl,
          title: channelName,
          format: "atom" as const,
        }))
      : null;
  } catch (error) {
    captureException(error, { context: "youtube-feed-discovery", url });
    return null;
  }
}

async function discoverFeedsWithoutLimits(
  url: string,
): Promise<DiscoveredFeed[]> {
  const [youtubeResult, feedscoutResult] = await Promise.allSettled([
    discoverYouTubeFeeds(url),
    discoverFeedsFromUrl(url, {
      methods: ["platform", "html", "headers", "guess"],
      concurrency: 2,
      maxUris: 8,
      fetchFn: async (targetUrl, options) => {
        const response = await readFeedHttp(targetUrl, {
          headers: options?.headers,
          method: options?.method,
        });
        return {
          headers: response.headers,
          body: response.text,
          url: response.url,
          status: response.status,
          statusText: response.statusText,
        };
      },
    }),
  ]);
  const discoveredFeeds: DiscoveredFeed[] = [];

  if (youtubeResult.status === "fulfilled" && youtubeResult.value) {
    discoveredFeeds.push(...youtubeResult.value);
  } else if (youtubeResult.status === "rejected") {
    captureException(youtubeResult.reason, {
      context: "feed-discovery-youtube",
      url,
    });
  }

  if (feedscoutResult.status === "fulfilled") {
    discoveredFeeds.push(
      ...feedscoutResult.value.filter((feed) => feed.isValid),
    );
  } else {
    captureException(feedscoutResult.reason, {
      context: "feed-discovery-feedscout",
      url,
    });
  }

  const seen = new Set<string>();
  return discoveredFeeds.filter((feed) => {
    if (seen.has(feed.url)) return false;
    seen.add(feed.url);
    return !(
      feed.url.includes("youtube.com") && !feed.url.includes("channel_id=")
    );
  });
}

export async function discoverFeeds(
  userId: string,
  url: string,
): Promise<DiscoveredFeed[]> {
  const lease = captureLimiter.acquire(userId, "discovery");
  if (!lease.ok) return [];

  try {
    return await discoverFeedsWithoutLimits(url);
  } finally {
    lease.release();
  }
}
