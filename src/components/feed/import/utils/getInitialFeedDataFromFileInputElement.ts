import { getInitialFeedDataFromCSVInput } from "./getInitialFeedDataFromCSVInput";
import { getInitialFeedDataFromOPMLInput } from "./getInitialFeedDataFromOPMLInput";
import { formError, formErrors, formSuccess } from "./shared";
import type {
  ImportFeedDataFromFileResult,
  ImportFeedDataFromFilesResult,
  ImportFeedDataItem,
} from "./shared";

async function getInitialFeedDataFromFile(
  file: File,
): Promise<ImportFeedDataFromFileResult> {
  const fileContent = await file.text();
  const fileExtension = file.name.split(".").pop()?.toLowerCase();

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
    return formError(`File "${file.name}" has an unsupported file type.`);
  }
}

export async function getInitialFeedDataFromFileInputElement(
  inputElement: HTMLInputElement,
): Promise<ImportFeedDataFromFilesResult> {
  if (!inputElement.files || inputElement.files.length === 0) {
    return formErrors(["Couldn't find a file."]);
  }

  const files = Array.from(inputElement.files);
  const results = await Promise.all(files.map(getInitialFeedDataFromFile));

  const errors: string[] = [];
  const allFeeds: ImportFeedDataItem[] = [];
  const seenUrls = new Set<string>();

  for (const result of results) {
    if (!result.success) {
      errors.push(result.error);
    } else {
      for (const feed of result.data) {
        if (!seenUrls.has(feed.feedUrl)) {
          seenUrls.add(feed.feedUrl);
          allFeeds.push(feed);
        }
      }
    }
  }

  if (allFeeds.length === 0 && errors.length > 0) {
    return formErrors(errors);
  }

  return formSuccess(allFeeds);
}
