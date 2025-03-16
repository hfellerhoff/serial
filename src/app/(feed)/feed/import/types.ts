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
  setImportedChannels: (channels: SubscriptionImportChannel[] | null) => void;
};
