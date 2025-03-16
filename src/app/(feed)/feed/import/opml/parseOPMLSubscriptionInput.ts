import { DatabaseFeed } from "~/server/db/schema";
import { SubscriptionImportChannel } from "../types";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

type OPMLFeed = {
  text: string;
  title: string;
  description: string;
  type: string;
  version: string;
  /**
   * A link to the actual, non-RSS website.
   */
  htmlUrl: string;
  /**
   * The rss feed link.
   */
  xmlUrl: string;
};

type OPMLCategory = {
  text: string;
  title: string;
  outline: OPMLFeed[];
};

type OPMLResult = {
  "?xml"?: {
    version: string;
    encoding: string;
  };
  opml: {
    head: {
      title: string;
    };
    body: {
      outline: (OPMLFeed | OPMLCategory)[];
    };
  };
};

function parseOPMLFeed(
  opmlFeed: OPMLFeed,
  feeds: DatabaseFeed[],
  categories?: string[],
) {
  let channelId = "";

  if (
    opmlFeed.xmlUrl.includes(
      "https://www.youtube.com/feeds/videos.xml?channel_id=",
    )
  ) {
    channelId = opmlFeed.xmlUrl.replace(
      "https://www.youtube.com/feeds/videos.xml?channel_id=",
      "",
    );
  }

  const hasFeedAlready = !!feeds?.find((feed) => feed.url === opmlFeed.xmlUrl);

  let disabledReason: SubscriptionImportChannel["disabledReason"] = null;
  if (hasFeedAlready) {
    disabledReason = "added-already";
  } else if (!channelId) {
    disabledReason = "not-supported";
  }

  return {
    channelId,
    feedUrl: opmlFeed.xmlUrl,
    title: opmlFeed.title,
    shouldImport: !disabledReason,
    disabledReason,
    categories: categories ?? [],
  } as SubscriptionImportChannel;
}

export async function parseOPMLSubscriptionInput(
  input: HTMLInputElement,
  feeds: DatabaseFeed[],
) {
  if (!input.files) return;

  const file = input.files?.[0];
  if (!file) return;

  const fileContent = await file.text();

  const opmlData = parser.parse(fileContent) as OPMLResult;

  const channels: SubscriptionImportChannel[] =
    opmlData.opml.body.outline.flatMap((entry) => {
      if ("outline" in entry) {
        return entry.outline.map((feed) =>
          parseOPMLFeed(feed, feeds, [entry.title]),
        );
      } else {
        return parseOPMLFeed(entry, feeds, [entry.title]);
      }
    });

  console.log(channels);

  return channels;
}
