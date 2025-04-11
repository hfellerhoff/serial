import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useFeeds } from "~/lib/data/feeds";
import { ImportDropzone } from "../ImportDropzone";
import { type SubscriptionImportMethodProps } from "../types";
import { parseYouTubeSubscriptionInput } from "./parseYouTubeSubscriptionInput";
import { YouTubeSubscriptionImportCarousel } from "./YouTubeSubscriptionImportCarousel";

export function YouTubeSubscriptionImport({
  setImportedChannels,
}: SubscriptionImportMethodProps) {
  const [inputElement, setInputElement] = useState<HTMLInputElement | null>(
    null,
  );

  const { feeds } = useFeeds();

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
    <>
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
      {!inputElement?.files?.length && (
        <div className="mt-16">
          <h3 className="mb-4 font-semibold">
            How do I find my &quot;subscriptions.csv&quot; file?
          </h3>
          <hr />
          <div className="mt-6 max-w-[calc(100vw-48px)]">
            <YouTubeSubscriptionImportCarousel />
          </div>
        </div>
      )}
    </>
  );
}
