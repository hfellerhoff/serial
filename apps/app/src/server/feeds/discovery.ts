import { discoverFeeds as discoverFeedsFromUrl } from "feedscout";

import { captureException } from "~/server/logger";

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
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch YouTube channel page: ${response.status} ${response.statusText}`,
      );
    }
    const text = await response.text();
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

export async function discoverFeeds(url: string): Promise<DiscoveredFeed[]> {
  const [youtubeResult, feedscoutResult] = await Promise.allSettled([
    discoverYouTubeFeeds(url),
    discoverFeedsFromUrl(url, {
      methods: ["platform", "html", "headers", "guess"],
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
