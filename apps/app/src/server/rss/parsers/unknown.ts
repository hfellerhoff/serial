import { readFeedHttp } from "../feedHttp";
import { getPeerTubeFeedIfMatches } from "./peertube";
import { getWebsiteFeedIfMatches } from "./website";
import type { NewFeedDetails } from "../types";
import { captureException, logError } from "~/server/logger";

export async function fetchUnknownRssFeed(
  url: string,
): Promise<NewFeedDetails | null> {
  try {
    const feed = await readFeedHttp(url);
    if (!feed.ok) {
      throw new Error(
        `Failed to fetch RSS feed: ${feed.status} ${feed.statusText}`,
      );
    }
    const text = feed.text;

    const peerTubeFeed = await getPeerTubeFeedIfMatches(text);
    if (peerTubeFeed) return peerTubeFeed;

    const websiteFeed = await getWebsiteFeedIfMatches(text, url);
    if (websiteFeed) return websiteFeed;

    return null;
  } catch (e) {
    captureException(e, { context: "unknown-feed-fetch", url });
    logError(e);
    return null;
  }
}
