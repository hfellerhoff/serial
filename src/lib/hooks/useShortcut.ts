import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { doesAnyFormElementHaveFocus } from "../doesAnyFormElementHaveFocus";
import { useDialogStore } from "~/components/feed/dialogStore";

/**
 * Borrowed from the ever-helpful Tania Rascia:
 * https://www.taniarascia.com/keyboard-shortcut-hook-react/
 *
 * Expanded with types and negative modifier support
 */
export const useShortcut = (
  shortcut: string,
  callback: (event: KeyboardEvent<Element>) => void,
  options = { disableTextInputs: true, disableDialogs: true },
) => {
  const callbackRef = useRef(callback);
  const [keyCombo, setKeyCombo] = useState<string[]>([]);

  const dialog = useDialogStore((store) => store.dialog);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const hasOpenDialog = !!dialog;
      const doesFormElementHaveFocus = doesAnyFormElementHaveFocus();

      // Cancel shortcut if key is being held down
      if (event.repeat) {
        return null;
      }

      // Don't enable shortcuts in inputs unless explicitly declared
      if (
        (options.disableTextInputs && doesFormElementHaveFocus) ||
        (options.disableDialogs && hasOpenDialog)
      ) {
        return event.stopPropagation();
      }

      const modifierMap: Record<string, boolean> = {
        Control: event.ctrlKey,
        Alt: event.altKey,
        Command: event.metaKey,
        Shift: event.shiftKey,
      };

      // Handle combined modifier key shortcuts (e.g. pressing Control + D)
      if (shortcut.includes("+")) {
        const keyArray = shortcut.split("+");

        const initialModifierKey = keyArray[0]!;

        const modifierKeys = Object.keys(modifierMap);

        // If the first key is a modifier, handle combinations
        if (modifierKeys.includes(initialModifierKey)) {
          const finalKey = keyArray.pop();

          // Run handler if the modifier(s) + key have both been pressed
          const doesEveryModifierMatch = modifierKeys.every((key) => {
            // If modifier provided, expect `true`
            if (keyArray.includes(key)) {
              return modifierMap[key];
            }
            // If modifier not provided, expect `false`
            return !modifierMap[key];
          });

          if (doesEveryModifierMatch && finalKey === event.key) {
            return callbackRef.current(event);
          }
        } else {
          // If the shortcut doesn't begin with a modifier, it's a sequence
          if (keyArray[keyCombo.length] === event.key) {
            // Handle final key in the sequence
            if (
              keyArray[keyArray.length - 1] === event.key &&
              keyCombo.length === keyArray.length - 1
            ) {
              // Run handler if the sequence is complete, then reset it
              callbackRef.current(event);
              return setKeyCombo([]);
            }

            // Add to the sequence
            return setKeyCombo((prevCombo) => [...prevCombo, event.key]);
          }
          if (keyCombo.length > 0) {
            // Reset key combo if it doesn't match the sequence
            return setKeyCombo([]);
          }
        }
      }

      // Single key shortcuts (e.g. pressing D)
      if (shortcut === event.key) {
        // Expect all modifiers to be false
        const isEveryModifierFalse = Object.values(modifierMap).every(
          (value) => !value,
        );

        if (!isEveryModifierFalse) {
          return;
        }

        return callbackRef.current(event);
      }
    },
    [
      dialog,
      shortcut,
      keyCombo.length,
      options.disableTextInputs,
      options.disableDialogs,
    ],
  );

  useEffect(() => {
    // @ts-expect-error don't know what's happening here
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      // @ts-expect-error don't know what's happening here
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
};
