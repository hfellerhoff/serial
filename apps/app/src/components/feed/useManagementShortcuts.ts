import { useEffect, useEffectEvent } from "react";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";

export function useFeedManagementShortcuts({
  onEscape,
  onSelectAll,
  onEdit,
  onClear,
  onDelete,
  isDialogOpen,
  hasSelection,
}: {
  onEscape: () => void;
  onSelectAll: () => void;
  onEdit: () => void;
  onClear: () => void;
  onDelete: () => void;
  isDialogOpen: boolean;
  hasSelection: boolean;
}) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat) return;
    if (doesAnyFormElementHaveFocus()) return;

    const target = event.target as HTMLElement;
    const isInDialog = target.closest('[role="dialog"]') !== null;

    switch (event.key) {
      case "Escape":
        if (!isDialogOpen && !isInDialog) {
          onEscape();
        }
        break;
      case "s":
        if (!isDialogOpen) {
          onSelectAll();
        }
        break;
      case "e":
        if (!isDialogOpen && hasSelection) {
          onEdit();
        }
        break;
      case "c":
        if (!isDialogOpen && hasSelection) {
          onClear();
        }
        break;
      case "d":
        if (!isDialogOpen && hasSelection) {
          onDelete();
        }
        break;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
