import { create } from "zustand";

export type DialogType =
  | "add-feed"
  | "add-view"
  | "add-content-category"
  | "custom-video"
  | "edit-user-profile";
type DialogStore = {
  dialog: null | DialogType;
  launchDialog: (dialog: DialogType) => void;
  closeDialog: () => void;
  onOpenChange: (open: boolean) => void;
};

export const useDialogStore = create<DialogStore>((set) => ({
  dialog: null,
  launchDialog: (dialog: DialogType) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  onOpenChange: () => set({ dialog: null }),
}));
