export interface UndoAction {
  message: string;
  onUndo: () => void | Promise<void>;
}

export const UNDO_TOAST_DURATION_MS = 10_000;
