import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useFeeds, useFeedsQuery } from "~/lib/data/feeds";
import { ImportDropzone } from "../ImportDropzone";
import { type SubscriptionImportMethodProps } from "../types";
import { parseOPMLSubscriptionInput } from "./parseOPMLSubscriptionInput";

export function OPMLSubscriptionImport({
  importedChannels,
  setImportedChannels,
}: SubscriptionImportMethodProps) {
  const [inputElement, setInputElement] = useState<HTMLInputElement | null>(
    null,
  );

  const { feeds } = useFeeds();

  const onSelectFiles = async () => {
    if (!inputElement || feeds === undefined) return;

    const newChannels = await parseOPMLSubscriptionInput(inputElement, feeds);
    if (!newChannels) {
      inputElement.value = "";
      return;
    }

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
            filename={".opml"}
          />
          <input
            ref={setInputElement}
            type="file"
            accept="text/x-opml"
            className="hidden"
            multiple={false}
            onChange={onSelectFiles}
          ></input>
          {!!importedChannels && inputElement && (
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
    </>
  );
}
