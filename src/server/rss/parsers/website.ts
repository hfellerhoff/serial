import Parser from "rss-parser";
import { z } from "zod";
import type { DatabaseFeed } from "~/server/db/schema";
import { isWithinDays } from "../rssUtils";
import type { NewFeedDetails, RSSContent, RSSFeed } from "../types";

const parser = new Parser({
  customFields: {
    item: [],
  },
});

export const websiteItemSchema = z.object({
  creator: z.string().optional(),
  title: z.string(),
  link: z.string(),
  pubDate: z.string().optional(),
  "content:encoded": z.string().optional(),
  content: z.string(),
  contentSnippet: z.string().optional(),
  guid: z.string(),
  isoDate: z.string().optional(),
  updated: z.string().optional(),
});

export const websiteSchema = z.object({
  items: websiteItemSchema.array(),
  image: z
    .object({
      link: z.string(),
      url: z.string(),
      title: z.string(),
    })
    .optional(),
  title: z.string(),
  description: z.string().optional(),
  generator: z.string().optional(),
  link: z.string(),
  lastBuildDate: z.string().optional(),
  ttl: z.string().optional(),
});

export async function getWebsiteFeedIfMatches(
  rssString: string,
  url: string,
): Promise<NewFeedDetails | null> {
  const rssData = await parser.parseString(rssString); //as unknown as RSSPeerTubeData;

  const {
    data: websiteData,
    success: websiteSuccess,
    error,
  } = websiteSchema.safeParse(rssData);

  if (websiteSuccess) {
    return {
      url: url,
      platform: "website",
      name: websiteData.title,
      imageUrl: websiteData.image?.url,
    };
  } else {
    console.error(error);
  }

  return null;
}

export async function fetchWebsiteFeedData(
  feed: DatabaseFeed,
): Promise<RSSFeed | null> {
  try {
    const feedResponse = await fetch(feed.url);
    const text = await feedResponse.text();
    const rssData = await parser.parseString(text);

    const data = websiteSchema.parse(rssData);

    const itemPromises = data.items
      .filter((item) =>
        isWithinDays(item?.pubDate || item?.isoDate || item?.updated || "", 60),
      )
      .map(async (item) => {
        const idParts = item.guid.split("/");
        const id = idParts[idParts.length - 1];

        if (!id) return null;

        return {
          id,
          title: item.title,
          publishedDate: item?.pubDate || item?.isoDate || item?.updated || "",
          url: item.link,
          author: item.creator,
          content: item["content:encoded"],
        } satisfies RSSContent;
      });

    return {
      id: feed.id,
      title: data.title,
      url: data.link,
      items: (await Promise.all(itemPromises)).filter(Boolean),
    };
  } catch (e) {
    console.error("Error fetching website feed data for URL =", feed.url);
    console.error(e);
    return null;
  }
}
