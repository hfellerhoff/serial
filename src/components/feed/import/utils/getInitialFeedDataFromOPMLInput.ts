import { XMLParser } from "fast-xml-parser";
import { formSuccess } from "./shared";
import type {
  ImportFeedDataFromFileResult,
  ImportFeedDataItem,
} from "./shared";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";

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
      outline: Array<OPMLFeed | OPMLCategory>;
    };
  };
};

function parseOPMLFeed(
  opmlFeed: OPMLFeed,
  categories?: string[],
): ImportFeedDataItem {
  // Drop any "section" whose name is the same as the feed's own title.
  // OPML files commonly wrap each bare feed in a synthetic section using the
  // feed's title as the section name; treating those as real sections would
  // create one tag/view per feed, which is never the user's intent.
  const filteredCategories =
    categories?.filter(
      (category) => !!category && category !== opmlFeed.title,
    ) ?? [];

  return {
    feedUrl: opmlFeed.xmlUrl,
    websiteUrl: opmlFeed.htmlUrl,
    title: opmlFeed.title,
    shouldImport: true,
    categories: filteredCategories,
    platform: getAssumedFeedPlatform(opmlFeed.xmlUrl),
  };
}

export function getInitialFeedDataFromOPMLInput(
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
