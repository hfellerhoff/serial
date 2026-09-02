import { create } from "zustand";
import { canMutateNow } from "~/lib/data/offline-mutations";

export type DialogType =
  | "add-feed"
  | "edit-feed"
  | "edit-bookmark"
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
  selectedBookmarkId: string | null;
  subscriptionView: SubscriptionView;
  settingsPane: SettingsPane;
  launchDialog: (
    dialog: DialogType,
    options?: {
      subscriptionView?: SubscriptionView;
      settingsPane?: SettingsPane;
      selectedFeedId?: number;
      selectedBookmarkId?: string;
    },
  ) => void;
  closeDialog: () => void;
  onOpenChange: (open: boolean) => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  selectedFeedId: null,
  selectedBookmarkId: null,
  subscriptionView: "overview",
  settingsPane: "main",
  launchDialog: (dialog, options) => {
    if (!canMutateNow()) return;
    set({
      dialog,
      subscriptionView: options?.subscriptionView ?? "overview",
      settingsPane: options?.settingsPane ?? "main",
      selectedFeedId: options?.selectedFeedId ?? null,
      selectedBookmarkId: options?.selectedBookmarkId ?? null,
    });
  },
  closeDialog: () =>
    set({
      dialog: null,
      selectedFeedId: null,
      selectedBookmarkId: null,
      subscriptionView: "overview",
      settingsPane: "main",
    }),
  onOpenChange: () =>
    set({
      dialog: null,
      selectedFeedId: null,
      selectedBookmarkId: null,
      subscriptionView: "overview",
      settingsPane: "main",
    }),
}));
