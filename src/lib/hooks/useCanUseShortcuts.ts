import { useDialogStore } from "~/components/feed/dialogStore";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";

export function useCanUseShortcuts() {
  const dialog = useDialogStore((store) => store.dialog);
  const hasOpenDialog = !!dialog;
  const doesFormElementHaveFocus = doesAnyFormElementHaveFocus();

  return {
    canUseShortcuts: !hasOpenDialog && !doesFormElementHaveFocus,
    hasOpenDialog,
    doesFormElementHaveFocus,
  };
}
