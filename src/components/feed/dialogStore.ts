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

type DialogStore = {
  dialog: null | DialogType;
  subscriptionView: SubscriptionView;
  launchDialog: (
    dialog: DialogType,
    options?: { subscriptionView?: SubscriptionView },
  ) => void;
  closeDialog: () => void;
  onOpenChange: (open: boolean) => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  subscriptionView: "overview",
  launchDialog: (dialog, options) =>
    set({
      dialog,
      subscriptionView: options?.subscriptionView ?? "overview",
    }),
  closeDialog: () => set({ dialog: null, subscriptionView: "overview" }),
  onOpenChange: () => set({ dialog: null, subscriptionView: "overview" }),
}));
