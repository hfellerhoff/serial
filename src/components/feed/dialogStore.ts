import { create } from "zustand";

export type DialogType =
  | "add-feed"
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
  subscriptionView: SubscriptionView;
  settingsPane: SettingsPane;
  launchDialog: (
    dialog: DialogType,
    options?: {
      subscriptionView?: SubscriptionView;
      settingsPane?: SettingsPane;
    },
  ) => void;
  closeDialog: () => void;
  onOpenChange: (open: boolean) => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  subscriptionView: "overview",
  settingsPane: "main",
  launchDialog: (dialog, options) =>
    set({
      dialog,
      subscriptionView: options?.subscriptionView ?? "overview",
      settingsPane: options?.settingsPane ?? "main",
    }),
  closeDialog: () =>
    set({ dialog: null, subscriptionView: "overview", settingsPane: "main" }),
  onOpenChange: () =>
    set({ dialog: null, subscriptionView: "overview", settingsPane: "main" }),
}));
