import { create } from "zustand";

export type DialogType =
  | "add-feed"
  | "edit-feed"
  | "add-view"
  | "add-content-category"
  | "custom-video"
  | "edit-user-profile"
  | "connections"
  | "subscription";

export type SubscriptionView = "overview" | "picker";
export type SettingsPane = "main" | "export" | "delete";

type DialogStore = {
  dialog: null | DialogType;
  selectedFeedId: number | null;
  subscriptionView: SubscriptionView;
  settingsPane: SettingsPane;
  launchDialog: (
    dialog: DialogType,
    options?: {
      subscriptionView?: SubscriptionView;
      settingsPane?: SettingsPane;
      selectedFeedId?: number;
    },
  ) => void;
  closeDialog: () => void;
  onOpenChange: (open: boolean) => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  selectedFeedId: null,
  subscriptionView: "overview",
  settingsPane: "main",
  launchDialog: (dialog, options) =>
    set({
      dialog,
      subscriptionView: options?.subscriptionView ?? "overview",
      settingsPane: options?.settingsPane ?? "main",
      selectedFeedId: options?.selectedFeedId ?? null,
    }),
  closeDialog: () =>
    set({
      dialog: null,
      selectedFeedId: null,
      subscriptionView: "overview",
      settingsPane: "main",
    }),
  onOpenChange: () =>
    set({
      dialog: null,
      selectedFeedId: null,
      subscriptionView: "overview",
      settingsPane: "main",
    }),
}));
