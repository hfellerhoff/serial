import type { ContentPlatform } from "~/lib/content/descriptor";

export const PLATFORM_TO_FORMATTED_NAME_MAP = {
  youtube: "YouTube",
  peertube: "PeerTube",
  nebula: "Nebula",
  website: "Website",
} as const satisfies Record<ContentPlatform, string>;
