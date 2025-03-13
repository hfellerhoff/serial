import { Button } from "~/components/ui/button";
import { DatabaseFeed } from "~/server/db/schema";

export type ParsedChannel = {
  channelId: string;
  feedUrl: string;
  title: string;
  shouldImport: boolean;
  isAddedAlready: boolean;
};

export function YouTubeSubscriptionInput({
  feeds,
  setRef,
  inputElement,
  onParseChannels,
}: {
  feeds: DatabaseFeed[] | undefined;
  setRef: React.Ref<HTMLInputElement>;
  inputElement: HTMLInputElement | null;
  onParseChannels: (channels: ParsedChannel[] | null) => void;
}) {
  return (
    <>
      {!!inputElement?.files?.length && (
        <Button
          className="w-full"
          variant="outline"
          size="lg"
          onClick={() => {
            onParseChannels(null);
            inputElement.value = "";
          }}
        >
          Not happy? Try again with another file
        </Button>
      )}
      <input
        ref={setRef}
        onChange={async (e) => {
          if (!e.target.files) return;

          const file = e.target.files?.[0];
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

              const hasFeedAlready = !!feeds?.find(
                (feed) => feed.url === feedUrl,
              );

              return {
                channelId,
                feedUrl,
                title,
                shouldImport: !hasFeedAlready,
                isAddedAlready: hasFeedAlready,
              };
            })
            .filter(Boolean);

          onParseChannels(channels);
        }}
        type="file"
        accept="text/csv"
        className="hidden"
        multiple={false}
      ></input>
    </>
  );
}
