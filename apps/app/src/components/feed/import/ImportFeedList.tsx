import { ItemGroup } from "@serial/ui";
import { ImportFeedRow } from "./ImportFeedRow";
import { compareImportTitles, IMPORT_MODE_OPTIONS } from "./importPageShared";
import type { RefObject } from "react";
import type {
  FailedImportUrls,
  ImportMode,
  SetFeedsFoundFromFile,
  UserFeeds,
} from "./importPageShared";
import type { ImportFeedDataItem } from "./utils/shared";
import { CardRadioGroup } from "~/components/ui/card-radio-group";
import { Button } from "~/components/ui/button";

function ImportSelectionHeader({
  channelImportCount,
  feeds,
  setFeedsFoundFromFile,
}: {
  channelImportCount: number | undefined;
  feeds: UserFeeds;
  setFeedsFoundFromFile: SetFeedsFoundFromFile;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold">Feeds To Import</h3>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          if (channelImportCount === 0) {
            setFeedsFoundFromFile((prevChannels) => {
              if (!prevChannels) return prevChannels;
              return prevChannels.map((channel) => {
                // Don't enable import for already-added feeds
                const isAlreadyAdded = feeds.some(
                  (feed) => feed.url === channel.feedUrl,
                );
                if (!isAlreadyAdded) {
                  channel.shouldImport = true;
                }
                return channel;
              });
            });
          } else {
            setFeedsFoundFromFile((prevChannels) => {
              if (!prevChannels) return prevChannels;
              return prevChannels.map((channel) => {
                channel.shouldImport = false;
                return channel;
              });
            });
          }
        }}
      >
        {channelImportCount === 0 ? "Select All" : "Deselect All"}
      </Button>
    </div>
  );
}

export function ImportFeedList({
  feedsFoundFromFile,
  feeds,
  isPostImportScreen,
  importMode,
  setImportMode,
  channelImportCount,
  failedImportUrls,
  setFeedsFoundFromFile,
  bottomRef,
}: {
  feedsFoundFromFile: ImportFeedDataItem[];
  feeds: UserFeeds;
  isPostImportScreen: boolean;
  importMode: ImportMode;
  setImportMode: (mode: ImportMode) => void;
  channelImportCount: number | undefined;
  failedImportUrls: FailedImportUrls;
  setFeedsFoundFromFile: SetFeedsFoundFromFile;
  bottomRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {!isPostImportScreen &&
        feedsFoundFromFile.some((f) => f.categories.length > 0) && (
          <div className="mt-12 grid gap-3">
            <h3 className="font-semibold">Sections</h3>
            <CardRadioGroup
              value={importMode}
              onValueChange={setImportMode}
              options={IMPORT_MODE_OPTIONS}
              orientation="vertical"
            />
          </div>
        )}
      <div className="mt-12">
        {!isPostImportScreen && (
          <ImportSelectionHeader
            channelImportCount={channelImportCount}
            feeds={feeds}
            setFeedsFoundFromFile={setFeedsFoundFromFile}
          />
        )}
        <ItemGroup className="mt-4">
          {[...feedsFoundFromFile].sort(compareImportTitles).map((channel) => (
            <ImportFeedRow
              key={channel.feedUrl}
              channel={channel}
              feeds={feeds}
              isPostImportScreen={isPostImportScreen}
              failedImportUrls={failedImportUrls}
              setFeedsFoundFromFile={setFeedsFoundFromFile}
            />
          ))}
        </ItemGroup>
        <div ref={bottomRef} />
      </div>
    </>
  );
}
