import { CheckIcon, MinusIcon, PauseIcon, PlusIcon, XIcon } from "lucide-react";
import type { ImportFeedDataItem } from "./utils/shared";
import type { FailedImportUrls, UserFeeds } from "./importPageShared";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

function ImportedFeedStatus({
  feedUrl,
  feeds,
}: {
  feedUrl: string;
  feeds: Array<{ url: string; isActive: boolean }>;
}) {
  const importedFeed = feeds.find((f) => f.url === feedUrl);
  const isInactive = importedFeed && !importedFeed.isActive;

  return (
    <Tooltip>
      <TooltipTrigger>
        {isInactive ? <PauseIcon size={20} /> : <CheckIcon size={20} />}
      </TooltipTrigger>
      <TooltipContent>
        {isInactive ? "Feed inactive" : "Imported Successfully!"}
      </TooltipContent>
    </Tooltip>
  );
}

export function ImportFeedRowActions({
  channel,
  feeds,
  displayTitle,
  isAlreadyAdded,
  wasImported,
  isPostImportScreen,
  failedImportUrls,
  setShouldImport,
}: {
  channel: ImportFeedDataItem;
  feeds: UserFeeds;
  displayTitle: string;
  isAlreadyAdded: boolean;
  wasImported: boolean;
  isPostImportScreen: boolean;
  failedImportUrls: FailedImportUrls;
  setShouldImport: (shouldImport: boolean) => void;
}) {
  return (
    <>
      {!isPostImportScreen && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={channel.shouldImport ? "default" : "ghost"}
              size="icon"
              className="size-7"
              aria-label={`${channel.shouldImport ? "Deselect" : "Select"} ${displayTitle}`}
              disabled={isAlreadyAdded}
              onClick={() => setShouldImport(!channel.shouldImport)}
            >
              {channel.shouldImport ? (
                <CheckIcon size={16} />
              ) : (
                <PlusIcon size={16} />
              )}
            </Button>
          </TooltipTrigger>
          {!isAlreadyAdded && (
            <TooltipContent>
              {channel.shouldImport ? "Deselect" : "Select"} feed
            </TooltipContent>
          )}
        </Tooltip>
      )}
      {isPostImportScreen && wasImported && channel.shouldImport && (
        <ImportedFeedStatus feedUrl={channel.feedUrl} feeds={feeds} />
      )}
      {isPostImportScreen &&
        channel.shouldImport &&
        failedImportUrls.has(channel.feedUrl) && (
          <Tooltip>
            <TooltipTrigger>
              <XIcon size={20} />
            </TooltipTrigger>
            <TooltipContent>Failed to import</TooltipContent>
          </Tooltip>
        )}
      {isPostImportScreen && !channel.shouldImport && (
        <Tooltip>
          <TooltipTrigger>
            <MinusIcon size={20} />
          </TooltipTrigger>
          <TooltipContent>
            This feed was excluded from the import.
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
