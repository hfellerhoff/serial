import { getInitialFeedDataFromCSVInput } from "./getInitialFeedDataFromCSVInput";
import { getInitialFeedDataFromOPMLInput } from "./getInitialFeedDataFromOPMLInput";
import { formError } from "./shared";
import type { ImportFeedDataFromFileResult } from "./shared";

export async function getInitialFeedDataFromFileInputElement(
  inputElement: HTMLInputElement,
): Promise<ImportFeedDataFromFileResult> {
  if (!inputElement.files) {
    return formError("Couldn't find a file.");
  }

  const file = inputElement.files[0];
  if (!file) {
    return formError("Couldn't find a file.");
  }

  const fileContent = await file.text();
  const [, fileExtension] = file.name.split(".");

  // subscriptions.csv
  if (fileExtension === "csv") {
    return getInitialFeedDataFromCSVInput(fileContent);
  }

  // *.opml
  else if (fileExtension === "opml") {
    return getInitialFeedDataFromOPMLInput(fileContent);
  }

  // rest
  else {
    return formError("This file type is not supported.");
  }
}
