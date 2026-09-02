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

// Punctuation codes for keys used in shortcut bindings, as
// [unshifted, shifted] pairs.
const PUNCTUATION_CODE_KEYS: Record<string, [string, string]> = {
  Backslash: ["\\", "|"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  Space: [" ", " "],
};

/**
 * Alt is the "peek at shortcuts" key, so shortcuts must still match while it
 * is held. On macOS, Option composes `event.key` into a different character
 * (Option+E → "´"), so recover the logical key from `event.code` instead.
 */
const getEventKey = (
  event: Pick<KeyboardEvent<Element>, "altKey" | "shiftKey" | "code" | "key">,
): string => {
  if (!event.altKey) {
    return event.key;
  }
  const { code } = event;
  if (code.startsWith("Key") && code.length === 4) {
    const letter = code.slice(3);
    return event.shiftKey ? letter : letter.toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6 && !event.shiftKey) {
    return code.slice(5);
  }
  const punctuation = PUNCTUATION_CODE_KEYS[code];
  if (punctuation) {
    return event.shiftKey ? punctuation[1] : punctuation[0];
  }
  return event.key;
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

      const eventKey = getEventKey(event);

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
              // Alt only peeks at the shortcut hints, so an unbound Alt
              // never disqualifies a match
              if (key === "Alt") {
                return true;
              }
              // If modifier not provided, expect `false`
              return !modifierMap[key];
            });

            if (doesEveryModifierMatch && finalKey === eventKey) {
              return callbackRef.current(event);
            }
          } else {
            // If the shortcut doesn't begin with a modifier, it's a sequence
            if (keyArray[keyCombo.length] === eventKey) {
              // Handle final key in the sequence
              if (
                keyArray[keyArray.length - 1] === eventKey &&
                keyCombo.length === keyArray.length - 1
              ) {
                // Run handler if the sequence is complete, then reset it
                callbackRef.current(event);
                return setKeyCombo([]);
              }

              // Add to the sequence
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
          // Expect all modifiers except the shortcut-hint Alt key to be false
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
          }

          return callbackRef.current(event);
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
