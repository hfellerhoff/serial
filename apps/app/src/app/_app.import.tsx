"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { ItemGroup } from "@serial/ui";
import { useSetAtom } from "jotai";
import {
  AlertTriangleIcon,
  CheckIcon,
  Loader2Icon,
  MinusIcon,
  PauseIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { ImportDropzone } from "../components/feed/import/ImportDropzone";
import { getInitialFeedDataFromFileInputElement } from "../components/feed/import/utils/getInitialFeedDataFromFileInputElement";
import type { CardRadioOption } from "~/components/ui/card-radio-group";
import type {
  ImportFeedDataFromFilesError,
  ImportFeedDataItem,
} from "../components/feed/import/utils/shared";
import { useDialogStore } from "~/components/feed/dialogStore";
import { FeedAvatar, FeedListItem } from "~/components/feed/FeedListItem";
import { ImportLoading } from "~/components/ImportLoading";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { CardRadioGroup } from "~/components/ui/card-radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { getGuidesUrl } from "~/lib/constants";
import { shouldAlwaysKeepSSEConnectionAlive } from "~/lib/data/atoms";
import { useFeeds } from "~/lib/data/feeds";
import { useImportDropStore } from "~/lib/data/import-drop";
import { useImportResults, useLoadingMode } from "~/lib/data/loading-machine";
import { feedItemsStore } from "~/lib/data/store";
import { dataSubscriptionActions } from "~/lib/data/useDataSubscription";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

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

export const Route = createFileRoute("/_app/import")({
  component: EditFeedsPage,
});

type ImportMode = "tags" | "views" | "ignore";

function getFeedWebsiteUrl(feed: ImportFeedDataItem) {
  if (feed.websiteUrl) return feed.websiteUrl;

  try {
    return new URL(feed.feedUrl).origin;
  } catch {
    return feed.feedUrl;
  }
}

const IMPORT_MODE_OPTIONS: Array<CardRadioOption<ImportMode>> = [
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

function EditFeedsPage() {
  const inputElementRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [feedsFoundFromFile, setFeedsFoundFromFile] = useState<
    ImportFeedDataItem[] | null
  >(null);
  const [hasStartedImport, setHasStartedImport] = useState(false);
  const [isImportComplete, setIsImportComplete] = useState(false);
  const [isImportPending, setIsImportPending] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("views");

  const [fileInputErrorList, setFileInputErrorList] =
    useState<ImportFeedDataFromFilesError | null>(null);
  const pendingDropResult = useImportDropStore((state) => state.pendingResult);
  const clearPendingDropResult = useImportDropStore(
    (state) => state.clearPendingResult,
  );

  // Signal to Playwright tests that React has hydrated and the onChange handler
  // is attached to the file input, so file-chooser interactions are reliable.
  useEffect(() => {
    inputElementRef.current?.setAttribute("data-ready", "true");
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsAtBottom(entry?.isIntersecting ?? false);
      },
      { threshold: 0 },
    );

    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, [feedsFoundFromFile]);

  const channelImportCount = feedsFoundFromFile?.filter(
    (feed) => feed.shouldImport,
  ).length;

  const { feeds } = useFeeds();
  const loading = useLoadingMode();
  const importResults = useImportResults();
  const isFetchingRss = loading.mode === "importing";
  const { failedImportUrls, importDeactivatedCount } = importResults;
  const { launchDialog } = useDialogStore();

  const isPostImportScreen = isImportComplete || hasStartedImport;
  const setShouldAlwaysKeepSSEConnectionAlive = useSetAtom(
    shouldAlwaysKeepSSEConnectionAlive,
  );

  const applyFileResult = (
    feedResult:
      | ImportFeedDataFromFilesError
      | { success: true; data: ImportFeedDataItem[] },
  ) => {
    if (feedResult.success) {
      // Mark already-added feeds as shouldImport: false
      const feedsWithImportStatus = feedResult.data.map((feed) => ({
        ...feed,
        shouldImport: !feeds.some(
          (existingFeed) => existingFeed.url === feed.feedUrl,
        ),
      }));
      setFeedsFoundFromFile(feedsWithImportStatus);
      setFileInputErrorList(null);
    } else {
      setFeedsFoundFromFile(null);
      setFileInputErrorList(feedResult);
    }
  };
  const applyPendingDropResult = useEffectEvent(applyFileResult);

  useEffect(() => {
    if (!pendingDropResult) return;

    const frame = requestAnimationFrame(() => {
      applyPendingDropResult(pendingDropResult);
      clearPendingDropResult();
    });

    return () => cancelAnimationFrame(frame);
  }, [pendingDropResult, clearPendingDropResult]);

  // Keep SSE open during import so visibility changes don't disconnect the
  // streaming import. Reset when the import loader is hidden.
  useEffect(() => {
    if (!isFetchingRss && hasStartedImport) {
      setShouldAlwaysKeepSSEConnectionAlive(false);
    }
  }, [isFetchingRss, hasStartedImport, setShouldAlwaysKeepSSEConnectionAlive]);

  useEffect(() => {
    return () => {
      setShouldAlwaysKeepSSEConnectionAlive(false);
    };
  }, [setShouldAlwaysKeepSSEConnectionAlive]);

  useEffect(() => {
    if (isImportPending && loading.mode === "importing" && !hasStartedImport) {
      const id = requestAnimationFrame(() => setHasStartedImport(true));
      return () => cancelAnimationFrame(id);
    }
  }, [isImportPending, loading.mode, hasStartedImport]);

  useEffect(() => {
    if (isImportComplete && importDeactivatedCount > 0) {
      const count = importDeactivatedCount;

      if (IS_DEMO_INSTANCE) {
        toast.warning(
          `${count} feed${count > 1 ? "s were" : " was"} added as inactive. This is the limit for the demo instance.`,
        );
      } else {
        toast.warning(
          `${count} feed${count > 1 ? "s were" : " was"} added as inactive. To unlock more active feeds, you can switch to a higher plan.`,
          {
            action: {
              label: "Upgrade",
              onClick: () =>
                launchDialog("subscription", { subscriptionView: "picker" }),
            },
          },
        );
      }
    }
  }, [isImportComplete, importDeactivatedCount, launchDialog]);

  const onSelectFiles = async () => {
    if (!inputElementRef.current) return;

    const feedResult = await getInitialFeedDataFromFileInputElement(
      inputElementRef.current,
    );
    inputElementRef.current.value = "";

    applyFileResult(feedResult);
  };

  const onFeedImport = async () => {
    if (!feedsFoundFromFile?.length) return;

    setShouldAlwaysKeepSSEConnectionAlive(true);
    setIsImportPending(true);

    const channelsToImport = feedsFoundFromFile
      .filter((channel) => channel.shouldImport)
      .map((feed) => ({
        categories: feed.categories,
        categoryPaths: feed.categoryPaths,
        feedUrl: feed.feedUrl,
        tagNames: feed.tagNames,
      }));

    // Capture the current timestamp so we can detect when the subscription
    // finishes processing all import chunks (initial-data-complete updates this).
    const prevFetchedAt = feedItemsStore.getState().fetchFeedItemsLastFetchedAt;

    try {
      // The RPC resolves when the server finishes publishing, but the
      // subscription may still be processing buffered chunks via rAF.
      await dataSubscriptionActions.streamingImport(
        channelsToImport,
        importMode,
      );

      // Wait for the store to process initial-data-complete from the import,
      // ensuring all feed items are available before showing "Import finished".
      // Times out after 30s to avoid hanging if the subscription drops.
      await Promise.race([
        new Promise<void>((resolve) => {
          const done = () => {
            unsubscribe();
            resolve();
          };
          const check = () => {
            if (
              feedItemsStore.getState().fetchFeedItemsLastFetchedAt !==
              prevFetchedAt
            ) {
              done();
            }
          };
          const unsubscribe = feedItemsStore.subscribe(check);
          check();
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 30000)),
      ]);

      setIsImportComplete(true);
    } finally {
      setIsImportPending(false);
    }
  };

  const onReset = () => {
    setFeedsFoundFromFile(null);
    setHasStartedImport(false);
    setIsImportComplete(false);
    setIsImportPending(false);
    setShouldAlwaysKeepSSEConnectionAlive(false);
  };

  if (isFetchingRss) {
    return <ImportLoading />;
  }

  return (
    <div>
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
                files from{" "}
                <a
                  href={getGuidesUrl("/how-to-export-youtube-subscriptions")}
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  a Google Takeout export
                </a>
              </li>
              <li>
                <code className="bg-muted text-foreground rounded px-1 py-0.5">
                  *.opml
                </code>{" "}
                files from another RSS reader&apos;s export
              </li>
            </ul>
            <ImportDropzone
              inputId="import-file-input"
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
                <Button>Back to home</Button>
              </Link>
              <Button variant="outline" onClick={onReset}>
                Import more
              </Button>
            </div>
          </>
        )}
        <input
          id="import-file-input"
          ref={inputElementRef}
          type="file"
          accept="text"
          aria-label="Import feed files"
          className="sr-only"
          multiple
          onChange={onSelectFiles}
        />
        {!!fileInputErrorList?.errors?.length && (
          <div className="text-destructive mt-2">
            {fileInputErrorList.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}
        {!!feedsFoundFromFile && (
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
              <ItemGroup className="mt-4">
                {[...feedsFoundFromFile]
                  .sort((a, b) => {
                    if (!a.title && !b.title) return 0;
                    if (!a.title) return -1;
                    if (!b.title) return -1;
                    return a.title.localeCompare(b.title);
                  })
                  .map((channel) => {
                    const displayTitle = channel.title ?? channel.feedUrl;
                    // Check if feed already exists in the feeds store
                    const isAlreadyAdded = feeds.some(
                      (feed) => feed.url === channel.feedUrl,
                    );
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
                        key={channel.feedUrl}
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
                          !isPostImportScreen && isAlreadyAdded ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="pointer-events-auto inline-flex">
                                  <FeedAvatar
                                    title={displayTitle}
                                    platform={channel.platform}
                                    fallback={
                                      <AlertTriangleIcon
                                        size={14}
                                        aria-label="Feed already exists"
                                      />
                                    }
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                Feed already exists
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <FeedAvatar
                              title={displayTitle}
                              platform={channel.platform}
                            />
                          )
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
                          <>
                            {!isPostImportScreen && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant={
                                      channel.shouldImport ? "default" : "ghost"
                                    }
                                    size="icon"
                                    className="size-7"
                                    aria-label={`${channel.shouldImport ? "Deselect" : "Select"} ${displayTitle}`}
                                    disabled={isAlreadyAdded}
                                    onClick={() =>
                                      setShouldImport(!channel.shouldImport)
                                    }
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
                                    {channel.shouldImport
                                      ? "Deselect"
                                      : "Select"}{" "}
                                    feed
                                  </TooltipContent>
                                )}
                              </Tooltip>
                            )}
                            {isPostImportScreen &&
                              wasImported &&
                              channel.shouldImport && (
                                <ImportedFeedStatus
                                  feedUrl={channel.feedUrl}
                                  feeds={feeds}
                                />
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
                          </>
                        }
                      />
                    );
                  })}
              </ItemGroup>
              <div ref={bottomRef} />
            </div>
          </>
        )}
      </div>
      {!!feedsFoundFromFile && !isPostImportScreen && (
        <div
          data-testid="import-footer"
          className={`bg-background sticky bottom-0 z-10 border-t transition-[border-color] ${
            isAtBottom ? "border-transparent" : "border-border"
          }`}
        >
          <div className="mx-auto max-w-2xl px-6 py-4">
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={onFeedImport}
              disabled={channelImportCount === 0 || isImportPending}
            >
              {isImportPending && !hasStartedImport ? (
                <>
                  Importing...
                  <Loader2Icon size={16} className="animate-spin" />
                </>
              ) : (
                <>Import {channelImportCount} feeds</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
