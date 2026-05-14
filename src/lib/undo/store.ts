import { createStore } from "zustand";
import type { UndoAction } from "./types";

export type UndoStore = {
  activeUndo: UndoAction | null;
  activeToastId: string | number | null;
  setActiveUndo: (
    action: UndoAction | null,
    toastId?: string | number | null,
  ) => void;
  clearActiveUndo: () => void;
};

export const undoStore = createStore<UndoStore>((set) => ({
  activeUndo: null,
  activeToastId: null,
  setActiveUndo: (action, toastId = null) =>
    set({ activeUndo: action, activeToastId: toastId }),
  clearActiveUndo: () => set({ activeUndo: null, activeToastId: null }),
}));
