import type { FeedPlatform } from "~/server/db/schema";

export const PLATFORM_TO_FORMATTED_NAME_MAP = {
  youtube: "YouTube",
  peertube: "PeerTube",
  website: "Website",
} as const satisfies Record<FeedPlatform, string>;
