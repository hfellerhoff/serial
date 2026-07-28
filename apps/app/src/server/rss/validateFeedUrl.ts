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

const NEBULA_URL_SEGMENTS = [
  "https://nebula.tv",
  "https://www.nebula.tv",
  "https://rss.nebula.app",
];

export function getAssumedFeedPlatform(url: string): FeedPlatform {
  if (YOUTUBE_URL_SEGMENTS.some((supported) => url.includes(supported))) {
    return "youtube";
  }
  if (PEERTUBE_URL_SEGMENTS.some((supported) => url.includes(supported))) {
    return "peertube";
  }
  if (NEBULA_URL_SEGMENTS.some((supported) => url.includes(supported))) {
    return "nebula";
  }
  return "website";
}
