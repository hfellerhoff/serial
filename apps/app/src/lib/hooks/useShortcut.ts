import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import { useDialogStore } from "~/components/feed/dialogStore";
import { doesAnyFormElementHaveFocus } from "~/lib/doesAnyFormElementHaveFocus";
import { getShortcutEventKey } from "~/lib/getShortcutEventKey";

/**
 * Borrowed from the ever-helpful Tania Rascia:
 * https://www.taniarascia.com/keyboard-shortcut-hook-react/
 *
 * Expanded with types and negative modifier support
 */
type UseShortcutOptions = {
  disableTextInputs?: boolean;
  disableDialogs?: boolean;
  allowRepeat?: boolean;
};

export const useShortcut = (
  shortcut: string | string[],
  callback: (event: KeyboardEvent<Element>) => void,
  options: UseShortcutOptions = {},
) => {
  const {
    disableTextInputs = true,
    disableDialogs = true,
    allowRepeat = false,
  } = options;
  const callbackRef = useRef(callback);
  const [keyCombo, setKeyCombo] = useState<string[]>([]);

  const hasOpenDialog = !!useDialogStore((store) => store.dialog);

  // Support binding several keys (e.g. an arrow key and its vim-style
  // equivalent) to the same handler.
  const shortcuts = Array.isArray(shortcut) ? shortcut : [shortcut];
  // Joined with a newline (never a valid key) so it serves as a stable dep.
  const shortcutsKey = shortcuts.join("\n");

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Cancel shortcut if key is being held down
      if (event.repeat && !allowRepeat) {
        return null;
      }

      // Don't enable shortcuts in inputs unless explicitly declared
      if (
        (disableTextInputs && doesAnyFormElementHaveFocus()) ||
        (disableDialogs && hasOpenDialog)
      ) {
        return event.stopPropagation();
      }

      const modifierMap: Record<string, boolean> = {
        Control: event.ctrlKey,
        Alt: event.altKey,
        Command: event.metaKey,
        Shift: event.shiftKey,
      };

      const eventKey = getShortcutEventKey(event);

      // Alt only peeks at the shortcut hints, so an unbound Alt never
      // disqualifies a match
      const isEveryOtherModifierFalse = Object.entries(modifierMap).every(
        ([name, pressed]) => name === "Alt" || !pressed,
      );

      const fireCallback = () => {
        // Alt+letter is a browser menu accelerator on Windows/Linux;
        // suppress it when the shortcut fires while peeking at the hints.
        // Named keys keep their default (Alt+Arrow is the browser history
        // gesture there).
        if (event.altKey && eventKey.length === 1) {
          event.preventDefault();
        }
        return callbackRef.current(event);
      };

      for (const currentShortcut of shortcutsKey.split("\n")) {
        // Handle combined modifier key shortcuts (e.g. pressing Control + D)
        if (currentShortcut.includes("+")) {
          const keyArray = currentShortcut.split("+");

          const initialModifierKey = keyArray[0]!;

          const modifierKeys = Object.keys(modifierMap);
          const modifierKeySet = new Set(modifierKeys);

          // If the first key is a modifier, handle combinations
          if (modifierKeySet.has(initialModifierKey)) {
            const finalKey = keyArray.pop();
            const pressedModifierSet = new Set(keyArray);

            // Run handler if the modifier(s) + key have both been pressed
            const doesEveryModifierMatch = modifierKeys.every((key) => {
              // If modifier provided, expect `true`
              if (pressedModifierSet.has(key)) {
                return modifierMap[key];
              }
              // If modifier not provided, expect `false` (except Alt, which
              // only peeks at the hints)
              return key === "Alt" || !modifierMap[key];
            });

            if (doesEveryModifierMatch && finalKey === eventKey) {
              return fireCallback();
            }
          } else {
            // If the shortcut doesn't begin with a modifier, it's a sequence,
            // which requires the same bare-key modifier state as single keys
            if (
              isEveryOtherModifierFalse &&
              keyArray[keyCombo.length] === eventKey
            ) {
              // Handle final key in the sequence
              if (
                keyArray[keyArray.length - 1] === eventKey &&
                keyCombo.length === keyArray.length - 1
              ) {
                // Run handler if the sequence is complete, then reset it
                fireCallback();
                return setKeyCombo([]);
              }

              // Add to the sequence; keep intermediate Alt-held keys away
              // from browser menu accelerators too
              if (event.altKey && eventKey.length === 1) {
                event.preventDefault();
              }
              return setKeyCombo((prevCombo) => [...prevCombo, eventKey]);
            }
            if (keyCombo.length > 0) {
              // Reset key combo if it doesn't match the sequence
              return setKeyCombo([]);
            }
          }
        }

        // Single key shortcuts (e.g. pressing D)
        if (currentShortcut === eventKey) {
          if (!isEveryOtherModifierFalse) {
            return;
          }

          return fireCallback();
        }
      }
    },
    [
      hasOpenDialog,
      shortcutsKey,
      keyCombo.length,
      disableTextInputs,
      disableDialogs,
      allowRepeat,
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
