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

    const key = getShortcutEventKey(event);
    // Alt+letter is a browser menu accelerator on Windows/Linux; suppress
    // it when a shortcut fires while peeking at the hints
    const fire = (action: () => void) => {
      if (event.altKey && key.length === 1) {
        event.preventDefault();
      }
      action();
    };

    switch (key) {
      case "Escape":
        if (!isDialogOpen && !isInDialog) {
          fire(onEscape);
        }
        break;
      case "s":
        if (!isDialogOpen) {
          fire(onSelectAll);
        }
        break;
      case "e":
        if (canMutate && !isDialogOpen && hasSelection) {
          fire(onEdit);
        }
        break;
      case "c":
        if (canMutate && !isDialogOpen && hasSelection) {
          fire(onClear);
        }
        break;
      case "d":
        if (canMutate && !isDialogOpen && hasSelection) {
          fire(onDelete);
        }
        break;
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
