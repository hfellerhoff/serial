import type { NewFeedDetails } from "../types";
import { getPeerTubeFeedIfMatches } from "./peertube";

export async function fetchUnknownRssFeed(
  url: string,
): Promise<NewFeedDetails | null> {
  try {
    const feed = await fetch(url);
    const text = await feed.text();

    const peerTubeFeed = await getPeerTubeFeedIfMatches(text);
    if (peerTubeFeed) return peerTubeFeed;

    return null;
  } catch (e) {
    console.error(e);
    return null;
  }
}
