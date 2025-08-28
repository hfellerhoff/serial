import type { FeedPlatform } from "../db/schema";

const YOUTUBE_URL_SEGMENTS = [
  "https://youtube.com/@",
  "https://www.youtube.com/@",
  "https://youtube.com/channel/",
  "https://www.youtube.com/channel/",
  "https://www.youtube.com/feeds/videos.xml?channel_id=",
];

const PEERTUBE_URL_SEGMENTS = [
  "/feeds/videos.xml?accountId=",
  "/feeds/videos.xml?videoChannelId=",
];

export const FEED_PLATFORM_LABEL_MAP = {
  website: "Website",
  youtube: "YouTube",
  peertube: "PeerTube",
} as const satisfies Record<FeedPlatform, string>;

export function getAssumedFeedPlatform(url: string): FeedPlatform {
  if (YOUTUBE_URL_SEGMENTS.some((supported) => url.includes(supported))) {
    return "youtube";
  }
  if (PEERTUBE_URL_SEGMENTS.some((supported) => url.includes(supported))) {
    return "peertube";
  }
  return "website";
}
