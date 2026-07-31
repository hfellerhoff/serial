"use client";

import { toast } from "sonner";
import { UndoToast } from "./UndoToast";
import { undoStore } from "./store";
import { UNDO_TOAST_DURATION_MS } from "./types";
import type { UndoAction } from "./types";

export function showUndoToast(action: UndoAction) {
  const state = undoStore.getState();
  let isFinalized = false;
  let toastId: string | number | null = null;

  const finalize = () => {
    if (isFinalized) return;
    isFinalized = true;

    try {
      action.onDismiss?.();
    } finally {
      const currentState = undoStore.getState();
      if (currentState.activeToastId === toastId) {
        currentState.clearActiveUndo();
      }
    }
  };

  if (state.activeToastId !== null) {
    toast.dismiss(state.activeToastId);
  }
  state.clearActiveUndo();

  toastId = toast.custom((t) => <UndoToast toastId={t} action={action} />, {
    duration: UNDO_TOAST_DURATION_MS,
    onDismiss: finalize,
    onAutoClose: finalize,
  });

  undoStore.getState().setActiveUndo(action, toastId);
}
