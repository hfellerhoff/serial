import type { FeedPlatform } from "~/server/db/schema";

export type ImportFeedDataItem = {
  feedUrl: string;
  websiteUrl?: string;
  title?: string;
  categories: string[];
  platform: FeedPlatform;
  shouldImport: boolean;
};

export type ImportFeedDataFromFileSuccess = {
  success: true;
  data: ImportFeedDataItem[];
};
export type ImportFeedDataFromFileError = {
  success: false;
  error: string;
};
export type ImportFeedDataFromFileResult =
  | ImportFeedDataFromFileError
  | ImportFeedDataFromFileSuccess;

export function formError(
  error: ImportFeedDataFromFileError["error"],
): ImportFeedDataFromFileError {
  return {
    success: false,
    error,
  };
}

export function formSuccess(
  data: ImportFeedDataFromFileSuccess["data"],
): ImportFeedDataFromFileSuccess {
  return {
    success: true,
    data,
  };
}
