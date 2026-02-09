"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MinusIcon,
  PlayCircleIcon,
  XIcon,
  YoutubeIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { ImportDropzone } from "../components/feed/import/ImportDropzone";
import { getInitialFeedDataFromFileInputElement } from "../components/feed/import/utils/getInitialFeedDataFromFileInputElement";
import type { FeedPlatform } from "~/server/db/schema";
import type { ImportFeedDataItem } from "../components/feed/import/utils/shared";
import { ImportLoading } from "~/components/ImportLoading";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useFeeds } from "~/lib/data/feeds";
import { useFetchFeedItemsStatus, useProgressState } from "~/lib/data/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";

function PlatformIcon({ platform }: { platform: FeedPlatform }) {
  switch (platform) {
    case "youtube":
      return <YoutubeIcon size={16} />;
    case "peertube":
      return <PlayCircleIcon size={16} />;
    case "website":
    default:
      return <GlobeIcon size={16} />;
  }
}

export const Route = createFileRoute("/_app/import")({
  component: EditFeedsPage,
});

function EditFeedsPage() {
  const inputElementRef = useRef<HTMLInputElement | null>(null);

  const [feedsFoundFromFile, setFeedsFoundFromFile] = useState<
    ImportFeedDataItem[] | null
  >(null);
  const [hasStartedImport, setHasStartedImport] = useState(false);
  const [isImportComplete, setIsImportComplete] = useState(false);

  const channelImportCount = feedsFoundFromFile?.filter(
    (feed) => feed.shouldImport,
  ).length;

  const { feeds } = useFeeds();
  const fetchStatus = useFetchFeedItemsStatus();
  const progressState = useProgressState();
  const isFetchingRss =
    fetchStatus === "fetching" && progressState.fetchType === "import";
  const failedImportUrls = progressState.failedImportUrls;

  const isPostImportScreen = isImportComplete || hasStartedImport;

  const onSelectFiles = async () => {
    if (!inputElementRef.current) return;

    const feedResult = await getInitialFeedDataFromFileInputElement(
      inputElementRef.current,
    );
    inputElementRef.current.value = "";

    if (feedResult.success) {
      // Mark already-added feeds as shouldImport: false
      const feedsWithImportStatus = feedResult.data.map((feed) => ({
        ...feed,
        shouldImport: !feeds.some(
          (existingFeed) => existingFeed.url === feed.feedUrl,
        ),
      }));
      setFeedsFoundFromFile(feedsWithImportStatus);
    }
  };

  const onFeedImport = async () => {
    if (!feedsFoundFromFile?.length) return;

    setTimeout(() => {
      setHasStartedImport(true);
    }, 500);

    const channelsToImport = feedsFoundFromFile
      .filter((channel) => channel.shouldImport)
      .map((feed) => ({
        categories: feed.categories,
        feedUrl: feed.feedUrl,
      }));

    // Use the new streaming import that handles both insert and RSS fetch
    await dataSubscriptionActions.streamingImport(channelsToImport);
    setIsImportComplete(true);
  };

  const onReset = () => {
    setFeedsFoundFromFile(null);
    setHasStartedImport(false);
    setIsImportComplete(false);
  };

  if (isFetchingRss) {
    return <ImportLoading />;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="font-sans text-lg">Import Feeds</h2>
      {!isPostImportScreen && (
        <>
          <p className="mt-2">Serial supports importing:</p>
          <ul className="mb-6 list-disc pl-4">
            <li>
              <code className="bg-muted text-foreground rounded px-1 py-0.5">
                subscriptions.csv
              </code>{" "}
              files from a Google Takeout export
            </li>
            <li>
              <code className="bg-muted text-foreground rounded px-1 py-0.5">
                *.opml
              </code>{" "}
              files from another RSS reader&apos;s export
            </li>
          </ul>
          <ImportDropzone
            inputElementRef={inputElementRef}
            onSelectFile={onSelectFiles}
          />
        </>
      )}
      {isPostImportScreen && (
        <>
          <p className="mt-2 mb-4">
            Import finished! Your list has been added.
          </p>
          <div className="flex gap-2">
            <Link to="/">
              <Button>Back to feeds</Button>
            </Link>
            <Button variant="outline" onClick={onReset}>
              Import more
            </Button>
          </div>
        </>
      )}
      <input
        ref={inputElementRef}
        type="file"
        accept="text/csv,.opml"
        className="hidden"
        multiple
        onChange={onSelectFiles}
      />
      {!!feedsFoundFromFile && (
        <>
          <div className="mt-12">
            {!isPostImportScreen && (
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
            )}
            <div className="mt-4">
              {feedsFoundFromFile
                .sort((a, b) => {
                  if (!a.title && !b.title) return 0;
                  if (!a.title) return -1;
                  if (!b.title) return -1;
                  return a.title.localeCompare(b.title);
                })
                .map((channel, i) => {
                  const displayTitle = channel.title ?? channel.feedUrl;
                  // Check if feed already exists in the feeds store
                  const isAlreadyAdded = feeds.some(
                    (feed) => feed.url === channel.feedUrl,
                  );
                  // Check if feed was imported by looking in the feeds store
                  const wasImported = isPostImportScreen && isAlreadyAdded;

                  return (
                    <div
                      key={displayTitle}
                      className="border-muted/50 flex items-center justify-between border-0 border-t border-solid py-4"
                    >
                      {!isPostImportScreen && isAlreadyAdded ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="bg-background border-foreground/30 text-foreground/50 mr-3 grid size-7 place-items-center rounded border border-dashed">
                              <AlertTriangleIcon size={16} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Feed already exists</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="bg-background border-foreground/30 text-foreground/50 mr-3 grid size-7 place-items-center rounded border border-solid">
                          <PlatformIcon platform={channel.platform} />
                        </span>
                      )}
                      <label
                        className="line-clamp-1 flex-1"
                        htmlFor={`channel ${displayTitle}`}
                      >
                        {displayTitle}
                      </label>

                      {!isPostImportScreen && (
                        <span className="space-x-1 px-2">
                          {channel.categories.map((category) => (
                            <Badge key={category} variant="outline">
                              {category}
                            </Badge>
                          ))}
                        </span>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        {channel.websiteUrl && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={channel.websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground ml-1 shrink-0 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLinkIcon size={16} />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Open original</TooltipContent>
                          </Tooltip>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          {!isPostImportScreen && (
                            <Checkbox
                              id={`channel ${displayTitle}`}
                              checked={channel.shouldImport}
                              onCheckedChange={(value) => {
                                setFeedsFoundFromFile((prevChannels) => {
                                  if (!prevChannels?.[i]) {
                                    return prevChannels;
                                  }

                                  prevChannels[i] = {
                                    ...prevChannels[i],
                                    shouldImport: value.valueOf() as boolean,
                                  };
                                  return [...prevChannels];
                                });
                              }}
                              disabled={isAlreadyAdded}
                            />
                          )}
                          {isPostImportScreen &&
                            wasImported &&
                            channel.shouldImport && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckIcon size={20} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Imported Successfully!
                                </TooltipContent>
                              </Tooltip>
                            )}
                          {isPostImportScreen &&
                            channel.shouldImport &&
                            failedImportUrls.has(channel.feedUrl) && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <XIcon size={20} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Failed to import
                                </TooltipContent>
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
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          {!isPostImportScreen && (
            <div className="fixed inset-x-0 bottom-0">
              <div className="mx-auto box-border max-w-2xl p-6">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={onFeedImport}
                  disabled={channelImportCount === 0}
                >
                  Import {channelImportCount} feeds
                </Button>
              </div>
            </div>
          )}
          <div className="h-12" />
        </>
      )}
    </div>
  );
}
