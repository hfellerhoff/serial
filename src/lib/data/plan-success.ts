import { create } from "zustand";

type PlanSuccessStore = {
  showDialog: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};

export const usePlanSuccessStore = create<PlanSuccessStore>((set) => ({
  showDialog: false,
  openDialog: () => set({ showDialog: true }),
  closeDialog: () => set({ showDialog: false }),
}));
