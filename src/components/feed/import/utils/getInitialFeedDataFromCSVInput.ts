import { formError, formSuccess } from "./shared";
import type {
  ImportFeedDataFromFileResult,
  ImportFeedDataItem,
} from "./shared";
import { getAssumedFeedPlatform } from "~/server/rss/validateFeedUrl";

const YT_CHANNEL_ID_COLUMN_LOWERCASE_NAME = "channel id";
const YT_CHANNEL_URL_COLUMN_LOWERCASE_NAME = "channel url";
const YT_CHANNEL_TITLE_COLUMN_LOWERCASE_NAME = "channel title";

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
    idTitle?.toLowerCase() !== YT_CHANNEL_ID_COLUMN_LOWERCASE_NAME ||
    urlTitle?.toLowerCase() !== YT_CHANNEL_URL_COLUMN_LOWERCASE_NAME ||
    titleTitle?.toLowerCase() !== YT_CHANNEL_TITLE_COLUMN_LOWERCASE_NAME
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
        websiteUrl: channelUrl,
        categories: [],
        platform: getAssumedFeedPlatform(feedUrl),
        shouldImport: true,
      };
    })
    .filter(Boolean);

  if (initialFeedData.length) {
    return formSuccess(initialFeedData);
  }

  return formError("Something went wrong.");
}
