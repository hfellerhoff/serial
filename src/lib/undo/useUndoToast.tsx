"use client";

import { toast } from "sonner";
import { UndoToast } from "./UndoToast";
import { undoStore } from "./store";
import { UNDO_TOAST_DURATION_MS } from "./types";
import type { UndoAction } from "./types";

export function showUndoToast(action: UndoAction) {
  const state = undoStore.getState();

  if (state.activeToastId !== null) {
    toast.dismiss(state.activeToastId);
  }
  state.clearActiveUndo();

  const toastId = toast.custom(
    (t) => <UndoToast toastId={t} action={action} />,
    {
      duration: UNDO_TOAST_DURATION_MS,
      onDismiss: () => {
        undoStore.getState().clearActiveUndo();
      },
    },
  );

  undoStore.getState().setActiveUndo(action, toastId);
}

export function clearUndoToast() {
  const state = undoStore.getState();
  if (state.activeToastId !== null) {
    toast.dismiss(state.activeToastId);
  }
  state.clearActiveUndo();
}
