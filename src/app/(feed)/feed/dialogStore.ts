import { create } from "zustand";

export type DialogType = "add-feed" | "add-view" | "custom-video";
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
