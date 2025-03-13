"use client";

import { useRef, useState } from "react";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  useCreateFeedMutation,
  useCreateFeedsFromSubscriptionImportMutation,
  useFeedsQuery,
} from "~/lib/data/feeds";
import { ImportDropzone } from "./ImportDropzone";
import {
  ParsedChannel,
  YouTubeSubscriptionInput,
} from "./YouTubeSubscriptionImportInput";
import { Checkbox } from "~/components/ui/checkbox";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { parseYouTubeSubscriptionInput } from "./parseYouTubeSubscriptionInput";
import { YouTubeSubscriptionImportCarousel } from "./YouTubeSubscriptionImportCarousel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import FeedLoading from "~/app/loading";

export default function EditFeedsPage() {
  const [inputElement, setInputElement] = useState<HTMLInputElement | null>(
    null,
  );
  const [importMethod, setImportMethod] = useState<string>("subscriptions");

  const [importedChannels, setImportedChannels] = useState<
    ParsedChannel[] | null
  >(null);

  const {
    mutateAsync: createFeedsFromSubscriptionImportMutation,
    isPending,
    isSuccess,
  } = useCreateFeedsFromSubscriptionImportMutation();

  const { data: feeds } = useFeedsQuery();

  const channelImportCount = importedChannels?.filter(
    (channel) => channel.shouldImport,
  ).length;

  if (isSuccess) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h2 className="font-mono text-lg">Import Feeds</h2>
        <div className="my-4">
          Import success! {channelImportCount} channels added.
        </div>
        <Link href="/feed/edit">
          <Button>Back to feeds</Button>
        </Link>
      </div>
    );
  }

  const onSelectFiles = async () => {
    if (!inputElement || feeds === undefined) return;

    const newChannels = await parseYouTubeSubscriptionInput(
      inputElement,
      feeds,
    );
    if (!newChannels) return;

    setImportedChannels(newChannels);
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      {isPending && <FeedLoading />}
      <h2 className="font-mono text-lg">Import Feeds</h2>
      <fieldset className="mt-4">
        <h3 className="font-semibold">Method</h3>
        <div className="mt-2 w-max">
          <RadioGroup
            defaultValue="subscriptions"
            onValueChange={setImportMethod}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="subscriptions" id="subscriptions" />
              <Label htmlFor="subscriptions">
                YouTube Subscriptions (<code>subscriptions.csv</code>)
              </Label>
            </div>
            {/* <div className="flex items-center space-x-2">
              <RadioGroupItem value="opml" id="opml" disabled />
              <Label htmlFor="opml">OPML (coming soon)</Label>
            </div> */}
          </RadioGroup>
        </div>
      </fieldset>

      <fieldset className="mt-12">
        <h3 className="font-semibold">Import File</h3>
        <div className="mt-2">
          <ImportDropzone
            inputElement={inputElement}
            onSelectFile={onSelectFiles}
            filename={'"subscriptions.csv"'}
          />
          <input
            ref={setInputElement}
            type="file"
            accept="text/csv"
            className="hidden"
            multiple={false}
            onChange={onSelectFiles}
          ></input>
          {!!inputElement?.files?.length && (
            <Button
              className="w-full"
              variant="outline"
              size="lg"
              onClick={() => {
                setImportedChannels(null);
                inputElement.value = "";
              }}
            >
              Not happy? Try again with another file
            </Button>
          )}
        </div>
      </fieldset>
      {!importedChannels && (
        <div className="mt-16">
          <h3 className="mb-4 font-semibold">
            How do I find my "subscriptions.csv" file?
          </h3>
          <hr />
          <div className="mt-6 max-w-[calc(100vw-48px)]">
            <YouTubeSubscriptionImportCarousel />
          </div>
        </div>
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
                        if (channel.isAddedAlready) {
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
                        if (channel.isAddedAlready) {
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
                  return a.title.localeCompare(b.title);
                })
                .map((channel, i) => (
                  <div
                    key={channel.channelId}
                    className="border-muted/50 flex items-center justify-between border-0 border-t border-solid py-4"
                  >
                    <label htmlFor={`channel ${channel.title}`}>
                      {channel.title}
                    </label>
                    <div
                      key={channel.channelId}
                      className="flex items-center justify-between gap-2"
                    >
                      {channel.isAddedAlready && (
                        <Badge variant="outline">
                          <CheckIcon size={8} /> Already added
                        </Badge>
                      )}
                      {!channel.isAddedAlready && (
                        <Checkbox
                          id={`channel ${channel.title}`}
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
                ))}
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0">
            <div className="mx-auto box-border max-w-2xl p-6">
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  createFeedsFromSubscriptionImportMutation({
                    channels: importedChannels,
                  });
                }}
                disabled={isPending || channelImportCount === 0}
              >
                Import {channelImportCount} channels
              </Button>
            </div>
          </div>
          <div className="h-12" />
        </>
      )}
    </div>
  );
}
