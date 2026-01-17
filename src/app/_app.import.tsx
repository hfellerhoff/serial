"use client";

import {
  CheckIcon,
  CircleQuestionMarkIcon,
  ExternalLinkIcon,
  GlobeIcon,
  MinusIcon,
  PlayCircleIcon,
  TriangleAlertIcon,
  YoutubeIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import FeedLoading from "~/components/loading";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useFeeds } from "~/lib/data/feeds";
import { useCreateFeedsFromSubscriptionImportMutation } from "~/lib/data/feeds/mutations";
import type { BulkImportFromFileResult } from "~/server/api/routers/feed-router";
import type { FeedPlatform } from "~/server/db/schema";
import { ImportDropzone } from "../components/feed/import/ImportDropzone";
import { getInitialFeedDataFromFileInputElement } from "../components/feed/import/utils/getInitialFeedDataFromFileInputElement";
import type { ImportFeedDataItem } from "../components/feed/import/utils/shared";
import { createFileRoute, Link } from "@tanstack/react-router";

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
  const [feedResults, setFeedResults] = useState<BulkImportFromFileResult[]>(
    [],
  );

  const {
    mutateAsync: createFeedsFromSubscriptionImportMutation,
    isPending,
    isSuccess,
    reset: resetCreateFeedsMutation,
  } = useCreateFeedsFromSubscriptionImportMutation();

  const channelImportCount = feedsFoundFromFile?.filter(
    (feed) => feed.shouldImport,
  ).length;

  const { feeds } = useFeeds();

  const onSelectFiles = async () => {
    if (!inputElementRef.current || feeds === undefined) return;

    const feedResult = await getInitialFeedDataFromFileInputElement(
      inputElementRef.current,
    );
    inputElementRef.current.value = "";

    if (feedResult.success) {
      setFeedsFoundFromFile(feedResult.data);
    }
  };

  const onFeedImport = async () => {
    if (!feedsFoundFromFile?.length) return;

    const channelsToImport = feedsFoundFromFile
      .filter((channel) => channel.shouldImport)
      .map((feed) => ({
        categories: feed.categories,
        feedUrl: feed.feedUrl,
      }));

    const results = await createFeedsFromSubscriptionImportMutation({
      feeds: channelsToImport,
    });

    setFeedResults(results);
  };

  const onReset = () => {
    setFeedsFoundFromFile(null);
    setFeedResults([]);
    resetCreateFeedsMutation();
  };

  if (isPending) {
    return <FeedLoading />;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="font-mono text-lg">Import Feeds</h2>
      {!isSuccess && (
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
      {isSuccess && (
        <>
          <p className="mt-2 mb-4">
            Imported finished! Check below to see the status of specific feed
            imports.
          </p>
          <div className="flex gap-2">
            <Link to="/">
              <Button>Back to feeds</Button>
            </Link>
            <Button variant="outline" onClick={onReset}>
              Try again
            </Button>
          </div>
        </>
      )}
      <input
        ref={inputElementRef}
        type="file"
        accept="text/csv,.opml"
        className="hidden"
        multiple={false}
        onChange={onSelectFiles}
      />
      {!!feedsFoundFromFile && (
        <>
          <div className="mt-12">
            {!isSuccess && (
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
                          channel.shouldImport = true;
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
                ?.sort((a, b) => {
                  if (!a.title && !b.title) return 0;
                  if (!a.title) return -1;
                  if (!b.title) return -1;
                  return a.title.localeCompare(b.title);
                })
                .map((channel, i) => {
                  const displayTitle = channel.title ?? channel.feedUrl;
                  const result = feedResults.find(
                    (result) => result.feedUrl === channel.feedUrl,
                  );

                  return (
                    <div
                      key={displayTitle}
                      className="border-muted/50 flex items-center justify-between border-0 border-t border-solid py-4"
                    >
                      <span className="bg-background border-foreground/30 text-foreground/50 mr-3 grid size-7 place-items-center rounded border border-solid">
                        <PlatformIcon platform={channel.platform} />
                      </span>
                      <label
                        className="line-clamp-1 flex-1"
                        htmlFor={`channel ${displayTitle}`}
                      >
                        {displayTitle}
                      </label>

                      {!isSuccess && (
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
                          {!isSuccess && (
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
                              disabled={
                                !!feeds?.find(
                                  (feed) => feed.url === channel.feedUrl,
                                )
                              }
                            />
                          )}
                          {!!result &&
                            (result.success ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CheckIcon size={20} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Imported Successfully!
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <TriangleAlertIcon size={20} />
                                </TooltipTrigger>
                                <TooltipContent>{result.error}</TooltipContent>
                              </Tooltip>
                            ))}
                          {!result &&
                            !!feedResults.length &&
                            channel.shouldImport && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <CircleQuestionMarkIcon size={20} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  We don&apos;t know what happened with this
                                  import. Feel free to file a bug report with
                                  this feed URL!
                                </TooltipContent>
                              </Tooltip>
                            )}
                          {!result &&
                            !!feedResults.length &&
                            !channel.shouldImport && (
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
          {!isSuccess && (
            <div className="fixed inset-x-0 bottom-0">
              <div className="mx-auto box-border max-w-2xl p-6">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={onFeedImport}
                  disabled={isPending || channelImportCount === 0}
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
