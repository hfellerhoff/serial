export type SubscriptionImportStage =
  | "upload"
  | "select"
  | "pending"
  | "success";
export type SubscriptionImportMethod = "subscriptions" | "opml";

export type SubscriptionImportChannel = {
  channelId: string;
  feedUrl: string;
  title: string;
  shouldImport: boolean;
  disabledReason: null | "added-already" | "not-supported";
  categories: string[];
};

export type SubscriptionImportMethodProps = {
  importedChannels: SubscriptionImportChannel[] | null;
  setImportedChannels: (channels: SubscriptionImportChannel[] | null) => void;
};
