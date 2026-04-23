import { getPeerTubeFeedIfMatches } from "./peertube";
import { getWebsiteFeedIfMatches } from "./website";
import type { NewFeedDetails } from "../types";
import { captureException } from "~/server/logger";

export async function fetchUnknownRssFeed(
  url: string,
): Promise<NewFeedDetails | null> {
  try {
    const feed = await fetch(url);
    const text = await feed.text();

    const peerTubeFeed = await getPeerTubeFeedIfMatches(text);
    if (peerTubeFeed) return peerTubeFeed;

    const websiteFeed = await getWebsiteFeedIfMatches(text, url);
    if (websiteFeed) return websiteFeed;

    return null;
  } catch (e) {
    captureException(e, { context: "unknown-feed-fetch", url });
    console.error(e);
    return null;
  }
}
