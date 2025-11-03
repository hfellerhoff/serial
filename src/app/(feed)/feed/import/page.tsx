"use client";

import { CheckIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { useFeeds } from "~/lib/data/feeds";
import {
  type SubscriptionImportMethod,
  type SubscriptionImportChannel,
} from "./types";
import { YouTubeSubscriptionImport } from "./youtube/YouTubeSubscriptionImport";
import { OPMLSubscriptionImport } from "./opml/OPMLSubscriptionImport";
import FeedLoading from "~/app/loading";
import { useCreateFeedsFromSubscriptionImportMutation } from "~/lib/data/feeds/mutations";

export default function EditFeedsPage() {
  const [importMethod, setImportMethod] =
    useState<SubscriptionImportMethod>("subscriptions");

  const [importedChannels, setImportedChannels] = useState<
    SubscriptionImportChannel[] | null
  >(null);

  const {
    mutateAsync: createFeedsFromSubscriptionImportMutation,
    isPending,
    isSuccess,
  } = useCreateFeedsFromSubscriptionImportMutation();

  const channelImportCount = importedChannels?.filter(
    (channel) => channel.shouldImport,
  ).length;

  const { feeds } = useFeeds();

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h2 className="font-mono text-lg">Import Feeds</h2>
        <div className="my-4">Import success! Channels added successfully.</div>
        <Link href="/feed/edit">
          <Button>Back to feeds</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      {isPending && <FeedLoading />}
      <h2 className="font-mono text-lg">Import Feeds</h2>
      {!importedChannels && (
        <fieldset className="mt-4">
          <h3 className="font-semibold">Method</h3>
          <div className="mt-2 w-max">
            <RadioGroup
              defaultValue={importMethod}
              onValueChange={(v) =>
                setImportMethod(v as SubscriptionImportMethod)
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="subscriptions" id="subscriptions" />
                <Label htmlFor="subscriptions">
                  YouTube Subscriptions (<code>subscriptions.csv</code>)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="opml" id="opml" />
                <Label htmlFor="opml">OPML</Label>
              </div>
            </RadioGroup>
          </div>
        </fieldset>
      )}
      {importMethod === "subscriptions" && (
        <YouTubeSubscriptionImport
          importedChannels={importedChannels}
          setImportedChannels={setImportedChannels}
        />
      )}
      {importMethod === "opml" && (
        <OPMLSubscriptionImport
          importedChannels={importedChannels}
          setImportedChannels={setImportedChannels}
        />
      )}
      {!!importedChannels && (
        <>
          <div className="mt-12">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Channels To Import</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (channelImportCount === 0) {
                    setImportedChannels((prevChannels) => {
                      if (!prevChannels) return prevChannels;
                      return prevChannels.map((channel) => {
                        if (!!channel.disabledReason) {
                          return channel;
                        }
                        channel.shouldImport = true;
                        return channel;
                      });
                    });
                  } else {
                    setImportedChannels((prevChannels) => {
                      if (!prevChannels) return prevChannels;
                      return prevChannels.map((channel) => {
                        if (!!channel.disabledReason) {
                          return channel;
                        }
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
              {importedChannels
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
                      <label
                        className="line-clamp-1"
                        htmlFor={`channel ${displayTitle}`}
                      >
                        {displayTitle}
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        {channel.disabledReason === "added-already" && (
                          <Badge variant="outline">
                            <CheckIcon size={8} /> Already added
                          </Badge>
                        )}
                        {channel.disabledReason === "not-supported" && (
                          <Badge variant="outline">
                            <XIcon size={8} /> Not supported
                          </Badge>
                        )}
                        {!channel.disabledReason && (
                          <Checkbox
                            id={`channel ${displayTitle}`}
                            checked={channel.shouldImport}
                            onCheckedChange={(value) => {
                              setImportedChannels((prevChannels) => {
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
                onClick={() => {
                  const channelsToImport = importedChannels.filter(
                    (channel) => channel.shouldImport,
                  );

                  void createFeedsFromSubscriptionImportMutation({
                    channels: channelsToImport,
                  });
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
