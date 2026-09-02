import { useEffect, useEffectEvent } from "react";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";
import { getShortcutEventKey } from "~/lib/getShortcutEventKey";
import { useCanMutate } from "~/lib/data/offline-mutations";

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
  const canMutate = useCanMutate();
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.repeat) return;
    // Alt only peeks at the shortcut hints, so it never disqualifies a
    // shortcut
    if (event.metaKey || event.ctrlKey) return;
    if (doesAnyFormElementHaveFocus()) return;

    const target = event.target as HTMLElement;
    const isInDialog = target.closest('[role="dialog"]') !== null;

    switch (getShortcutEventKey(event)) {
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
        if (canMutate && !isDialogOpen && hasSelection) {
          onEdit();
        }
        break;
      case "c":
        if (canMutate && !isDialogOpen && hasSelection) {
          onClear();
        }
        break;
      case "d":
        if (canMutate && !isDialogOpen && hasSelection) {
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
