import type { Dispatch, SetStateAction } from "react";
import type { CardRadioOption } from "~/components/ui/card-radio-group";
import type { ImportFeedDataItem } from "./utils/shared";
import type { useFeeds } from "~/lib/data/feeds";
import type { useImportResults } from "~/lib/data/loading-machine";

export type ImportMode = "tags" | "views" | "ignore";

export type UserFeeds = ReturnType<typeof useFeeds>["feeds"];
export type FailedImportUrls = ReturnType<
  typeof useImportResults
>["failedImportUrls"];
export type SetFeedsFoundFromFile = Dispatch<
  SetStateAction<ImportFeedDataItem[] | null>
>;

export function getFeedWebsiteUrl(feed: ImportFeedDataItem) {
  if (feed.websiteUrl) return feed.websiteUrl;

  try {
    return new URL(feed.feedUrl).origin;
  } catch {
    return feed.feedUrl;
  }
}

export const IMPORT_MODE_OPTIONS: Array<CardRadioOption<ImportMode>> = [
  {
    value: "views",
    title: "Import sections as Views",
    description:
      "Each section in the file becomes a view, and feeds are linked directly to it.",
  },
  {
    value: "tags",
    title: "Import sections as Tags",
    description:
      "Each section in the file becomes a tag, and feeds are tagged with it.",
  },
  {
    value: "ignore",
    title: "Ignore sections",
    description:
      "Import the feeds without preserving any of the section groupings.",
  },
];

export function compareImportTitles(
  a: ImportFeedDataItem,
  b: ImportFeedDataItem,
) {
  if (!a.title && !b.title) return 0;
  if (!a.title) return -1;
  if (!b.title) return -1;
  return a.title.localeCompare(b.title);
}
