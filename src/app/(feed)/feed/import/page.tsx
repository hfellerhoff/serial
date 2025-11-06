"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import FeedLoading from "~/app/loading";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { useFeeds } from "~/lib/data/feeds";
import { useCreateFeedsFromSubscriptionImportMutation } from "~/lib/data/feeds/mutations";
import { PLATFORM_TO_FORMATTED_NAME_MAP } from "~/lib/data/feeds/utils";
import { ImportDropzone } from "./ImportDropzone";
import { getInitialFeedDataFromFileInputElement } from "./utils/getInitialFeedDataFromFileInputElement";
import { ImportFeedDataItem } from "./utils/shared";
import { FeedPlatform } from "~/server/db/schema";
import { GlobeIcon, PlayCircleIcon, YoutubeIcon } from "lucide-react";

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

export default function EditFeedsPage() {
  const inputElementRef = useRef<HTMLInputElement | null>(null);

  const [feedsFoundFromFile, setFeedsFoundFromFile] = useState<
    ImportFeedDataItem[] | null
  >(null);

  const {
    mutateAsync: createFeedsFromSubscriptionImportMutation,
    isPending,
    isSuccess,
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

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h2 className="font-mono text-lg">Import Feeds</h2>
        <div className="my-4">Import success! Channels added successfully.</div>
        <Link href="/feed">
          <Button>Back to feeds</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {isPending && <FeedLoading />}
      <h2 className="font-mono text-lg">Import Feeds</h2>
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
          files from another RSS reader's export
        </li>
      </ul>
      <ImportDropzone
        inputElementRef={inputElementRef}
        onSelectFile={onSelectFiles}
      />
      <input
        ref={inputElementRef}
        type="file"
        accept="text/*"
        className="hidden"
        multiple={false}
        onChange={onSelectFiles}
      />
      {!!feedsFoundFromFile && (
        <>
          <div className="mt-12">
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
            <div className="mt-4 space-y-2">
              {feedsFoundFromFile
                ?.sort((a, b) => {
                  if (!a.title && !b.title) return 0;
                  if (!a.title) return -1;
                  if (!b.title) return -1;
                  return a.title.localeCompare(b.title);
                })
                .map((channel, i) => {
                  const displayTitle = channel.title ?? channel.feedUrl;

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
                      <span className="space-x-1 px-2">
                        {channel.categories.map((category) => (
                          <Badge key={category} variant="outline">
                            {category}
                          </Badge>
                        ))}
                      </span>
                      <div className="flex items-center justify-between gap-2">
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
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0">
            <div className="mx-auto box-border max-w-2xl p-6">
              <Button
                className="w-full"
                size="lg"
                onClick={async () => {
                  const channelsToImport = feedsFoundFromFile.filter(
                    (channel) => channel.shouldImport,
                  );

                  const errors =
                    await createFeedsFromSubscriptionImportMutation({
                      feeds: channelsToImport,
                    });

                  console.log(errors);
                }}
                disabled={isPending || channelImportCount === 0}
              >
                Import {channelImportCount} feeds
              </Button>
            </div>
          </div>
          <div className="h-12" />
        </>
      )}
    </div>
  );
}
