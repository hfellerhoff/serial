import { AlertTriangleIcon } from "lucide-react";
import { ImportFeedRowActions } from "./ImportFeedRowActions";
import { getFeedWebsiteUrl } from "./importPageShared";
import type {
  FailedImportUrls,
  SetFeedsFoundFromFile,
  UserFeeds,
} from "./importPageShared";
import type { ImportFeedDataItem } from "./utils/shared";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Badge } from "~/components/ui/badge";
import { FeedAvatar, FeedListItem } from "~/components/feed/FeedListItem";

function ImportFeedRowMedia({
  displayTitle,
  platform,
  showExistsWarning,
}: {
  displayTitle: string;
  platform: ImportFeedDataItem["platform"];
  showExistsWarning: boolean;
}) {
  if (!showExistsWarning) {
    return <FeedAvatar title={displayTitle} platform={platform} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="pointer-events-auto inline-flex">
          <FeedAvatar
            title={displayTitle}
            platform={platform}
            fallback={
              <AlertTriangleIcon size={14} aria-label="Feed already exists" />
            }
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>Feed already exists</TooltipContent>
    </Tooltip>
  );
}

export function ImportFeedRow({
  channel,
  feeds,
  isPostImportScreen,
  failedImportUrls,
  setFeedsFoundFromFile,
}: {
  channel: ImportFeedDataItem;
  feeds: UserFeeds;
  isPostImportScreen: boolean;
  failedImportUrls: FailedImportUrls;
  setFeedsFoundFromFile: SetFeedsFoundFromFile;
}) {
  const displayTitle = channel.title ?? channel.feedUrl;
  // Check if feed already exists in the feeds store
  const isAlreadyAdded = feeds.some((feed) => feed.url === channel.feedUrl);
  // Check if feed was imported by looking in the feeds store
  const wasImported = isPostImportScreen && isAlreadyAdded;
  const websiteUrl = getFeedWebsiteUrl(channel);
  const setShouldImport = (shouldImport: boolean) => {
    if (isAlreadyAdded || isPostImportScreen) return;

    setFeedsFoundFromFile((prevChannels) => {
      if (!prevChannels) return prevChannels;

      return prevChannels.map((previousChannel) =>
        previousChannel.feedUrl === channel.feedUrl
          ? { ...previousChannel, shouldImport }
          : previousChannel,
      );
    });
  };

  return (
    <FeedListItem
      title={displayTitle}
      titleHref={websiteUrl}
      description={
        <a
          href={channel.feedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto relative z-10"
          onClick={(event) => event.stopPropagation()}
        >
          {channel.feedUrl}
        </a>
      }
      platform={channel.platform}
      variant="outline"
      size="xs"
      interactive={!isPostImportScreen && !isAlreadyAdded}
      disabled={isAlreadyAdded}
      selected={!isPostImportScreen && channel.shouldImport}
      onClick={() => setShouldImport(!channel.shouldImport)}
      media={
        <ImportFeedRowMedia
          displayTitle={displayTitle}
          platform={channel.platform}
          showExistsWarning={!isPostImportScreen && isAlreadyAdded}
        />
      }
      details={
        <>
          {!isPostImportScreen &&
            channel.categories.map((category) => (
              <Badge key={category} variant="outline">
                {category}
              </Badge>
            ))}
        </>
      }
      actions={
        <ImportFeedRowActions
          channel={channel}
          feeds={feeds}
          displayTitle={displayTitle}
          isAlreadyAdded={isAlreadyAdded}
          wasImported={wasImported}
          isPostImportScreen={isPostImportScreen}
          failedImportUrls={failedImportUrls}
          setShouldImport={setShouldImport}
        />
      }
    />
  );
}
