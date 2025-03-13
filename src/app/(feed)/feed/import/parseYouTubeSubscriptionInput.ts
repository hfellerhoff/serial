import { DatabaseFeed } from "~/server/db/schema";

export type ParsedChannel = {
  channelId: string;
  feedUrl: string;
  title: string;
  shouldImport: boolean;
  isAddedAlready: boolean;
};

export async function parseYouTubeSubscriptionInput(
  input: HTMLInputElement,
  feeds: DatabaseFeed[],
) {
  if (!input.files) return;

  const file = input.files?.[0];
  if (!file) return;

  const fileContent = await file.text();
  const rows = fileContent.split("\n");

  const [headerRow, ...restRows] = rows;
  if (!headerRow) return;

  const [idTitle, urlTitle, titleTitle] = headerRow.split(",");

  if (
    idTitle !== "Channel Id" ||
    urlTitle !== "Channel Url" ||
    titleTitle !== "Channel Title"
  ) {
    console.error("doesn't match format");
    return;
  }

  const channels: ParsedChannel[] = restRows
    .map((row) => {
      const [channelId, channelUrl, title] = row.split(",");

      if (!channelId || !channelUrl || !title) {
        return null;
      }

      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

      const hasFeedAlready = !!feeds?.find((feed) => feed.url === feedUrl);

      return {
        channelId,
        feedUrl,
        title,
        shouldImport: !hasFeedAlready,
        isAddedAlready: hasFeedAlready,
      };
    })
    .filter(Boolean);

  return channels;
}
