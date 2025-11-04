import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";
import {
  formError,
  formSuccess,
  type ImportFeedDataFromFileResult,
  type ImportFeedDataItem,
} from "./shared";

export function getInitialFeedDataFromCSVInput(
  fileContent: string,
): ImportFeedDataFromFileResult {
  const rows = fileContent.split("\n");
  const [headerRow, ...channelRows] = rows;

  if (!headerRow) {
    return formError("File doesn't match expected length.");
  }

  const [idTitle, urlTitle, titleTitle] = headerRow.split(",");

  if (
    idTitle !== "Channel Id" ||
    urlTitle !== "Channel Url" ||
    titleTitle !== "Channel Title"
  ) {
    return formError(
      'File doesn\'t match expected format. Ensure your CSV has the "Channel Id", "Channel Url", and "Channel Title" column headers.',
    );
  }

  const initialFeedData = channelRows
    .map((row): ImportFeedDataItem | null => {
      const [channelId, channelUrl, title] = row.split(",");

      if (!channelId || !channelUrl || !title) {
        return null;
      }

      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      return {
        title,
        feedUrl,
        categories: [],
        platform: getAssumedFeedPlatform(feedUrl),
        shouldImport: true,
      };
    })
    .filter(Boolean);

  if (!!initialFeedData.length) {
    return formSuccess(initialFeedData);
  }

  return formError("Something went wrong.");
}
