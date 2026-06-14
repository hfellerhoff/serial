import { XMLParser } from "fast-xml-parser";
import { formSuccess } from "./shared";
import type {
  ImportCategoryPathItem,
  ImportFeedDataFromFileResult,
  ImportFeedDataItem,
} from "./shared";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

type OPMLFeed = {
  text?: string;
  title?: string;
  description?: string;
  type?: string;
  version?: string;
  /**
   * A link to the actual, non-RSS website.
   */
  htmlUrl?: string;
  /**
   * The rss feed link.
   */
  xmlUrl: string;
  category?: string;
  "serial:tags"?: string;
};

type OPMLCategory = {
  text?: string;
  title?: string;
  outline?: OPMLOutline | OPMLOutline[];
  "serial:outlineType"?: ImportCategoryPathItem["type"];
  "serial:feedXmlUrl"?: string;
};

type OPMLOutline = OPMLFeed | OPMLCategory;

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
      outline: OPMLOutline | OPMLOutline[];
    };
  };
};

function parseOPMLFeed(
  opmlFeed: OPMLFeed,
  categoryPath: ImportCategoryPathItem[],
): ImportFeedDataItem {
  const title = opmlFeed.title ?? opmlFeed.text ?? opmlFeed.xmlUrl;

  // Drop a single "section" whose name is the same as the feed's own title.
  // OPML files commonly wrap each bare feed in a synthetic section using the
  // feed's title as the section name; treating those as real sections would
  // create one tag/view per feed, which is never the user's intent.
  const filteredCategoryPath =
    categoryPath.length === 1 && categoryPath[0]?.name === title
      ? []
      : categoryPath;

  return {
    feedUrl: opmlFeed.xmlUrl,
    websiteUrl: opmlFeed.htmlUrl,
    title,
    shouldImport: true,
    categories: [...new Set(filteredCategoryPath.map((item) => item.name))],
    categoryPaths:
      filteredCategoryPath.length > 0 ? [filteredCategoryPath] : undefined,
    tagNames: getOPMLFeedTags(opmlFeed),
    platform: getAssumedFeedPlatform(opmlFeed.xmlUrl),
  };
}

function getOPMLFeedTags(opmlFeed: OPMLFeed) {
  const serialTags = opmlFeed["serial:tags"];
  if (serialTags) {
    try {
      const parsed = JSON.parse(serialTags);
      if (parsed instanceof Array) {
        return parsed.filter(
          (tagName): tagName is string =>
            typeof tagName === "string" && tagName.trim().length > 0,
        );
      }
    } catch {
      // Fall through to the standard OPML category attribute.
    }
  }

  return (
    opmlFeed.category
      ?.split(",")
      .map((tagName) => tagName.trim())
      .filter((tagName) => !!tagName) ?? []
  );
}

function getOutlineName(outline: OPMLOutline): string | null {
  const name = outline.title ?? outline.text;
  return name?.trim() || null;
}

function getOutlineType(outline: OPMLCategory) {
  return outline["serial:outlineType"];
}

function getCategoryPathItem(
  name: string,
  outline: OPMLCategory,
): ImportCategoryPathItem {
  const type = getOutlineType(outline);
  const feedUrl = outline["serial:feedXmlUrl"];

  return {
    name,
    ...(type ? { type } : {}),
    ...(feedUrl ? { feedUrl } : {}),
  };
}

function outlineList(outline?: OPMLOutline | OPMLOutline[]): OPMLOutline[] {
  if (!outline) return [];
  return outline instanceof Array ? outline : [outline];
}

function isOPMLFeed(outline: OPMLOutline): outline is OPMLFeed {
  return "xmlUrl" in outline && !!outline.xmlUrl;
}

function parseOutline(
  outline: OPMLOutline,
  categoryPath: ImportCategoryPathItem[],
): ImportFeedDataItem[] {
  if (isOPMLFeed(outline)) {
    return [parseOPMLFeed(outline, categoryPath)];
  }

  const outlineName = getOutlineName(outline);
  const nextCategoryPath = outlineName
    ? [...categoryPath, getCategoryPathItem(outlineName, outline)]
    : categoryPath;

  return outlineList(outline.outline).flatMap((childOutline) =>
    parseOutline(childOutline, nextCategoryPath),
  );
}

export function getInitialFeedDataFromOPMLInput(
  fileContent: string,
): ImportFeedDataFromFileResult {
  const opmlData = parser.parse(fileContent) as OPMLResult;
  const feeds = outlineList(opmlData.opml.body.outline).flatMap((entry) =>
    parseOutline(entry, []),
  );

  return formSuccess(feeds);
}
