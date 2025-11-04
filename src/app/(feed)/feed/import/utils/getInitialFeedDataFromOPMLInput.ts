import { XMLParser } from "fast-xml-parser";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";
import {
  formSuccess,
  ImportFeedDataFromFileResult,
  ImportFeedDataItem,
} from "./shared";

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
  outline: OPMLFeed | OPMLFeed[];
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
  categories?: string[],
): ImportFeedDataItem {
  return {
    feedUrl: opmlFeed.xmlUrl,
    title: opmlFeed.title,
    shouldImport: true,
    categories: categories ?? [],
    platform: getAssumedFeedPlatform(opmlFeed.xmlUrl),
  };
}

export async function getInitialFeedDataFromOPMLInput(
  fileContent: string,
): ImportFeedDataFromFileResult {
  const opmlData = parser.parse(fileContent) as OPMLResult;

  const feeds: ImportFeedDataItem[] = opmlData.opml.body.outline.flatMap(
    (entry) => {
      if ("outline" in entry) {
        if (entry.outline instanceof Array) {
          return entry.outline.map((feed) =>
            parseOPMLFeed(feed, [entry.title]),
          );
        }
        return [parseOPMLFeed(entry.outline, [entry.title])];
      } else {
        return parseOPMLFeed(entry, [entry.title]);
      }
    },
  );

  return formSuccess(feeds);
}
