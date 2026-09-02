// [unshifted, shifted] logical keys for the printable physical key
// positions, used to recover a shortcut key from `event.code` when the OS
// composes `event.key` (macOS Option).
const CODE_KEYS: Record<string, [string, string]> = {
  Digit1: ["1", "!"],
  Digit2: ["2", "@"],
  Digit3: ["3", "#"],
  Digit4: ["4", "$"],
  Digit5: ["5", "%"],
  Digit6: ["6", "^"],
  Digit7: ["7", "&"],
  Digit8: ["8", "*"],
  Digit9: ["9", "("],
  Digit0: ["0", ")"],
  Backquote: ["`", "~"],
  Minus: ["-", "_"],
  Equal: ["=", "+"],
  BracketLeft: ["[", "{"],
  BracketRight: ["]", "}"],
  Backslash: ["\\", "|"],
  Semicolon: [";", ":"],
  Quote: ["'", '"'],
  Comma: [",", "<"],
  Period: [".", ">"],
  Slash: ["/", "?"],
  Space: [" ", " "],
};

type ShortcutKeyboardEvent = {
  altKey: boolean;
  shiftKey: boolean;
  code: string;
  key: string;
};

// A key the OS composed under Option: either a dead key or a character
// outside printable ASCII (Option+E → "´", Option+Space → nbsp).
const isComposedKey = (key: string) =>
  key === "Dead" || (key.length === 1 && key.charCodeAt(0) > 127);

/**
 * Alt is the "peek at shortcuts" key, so shortcuts must still match while it
 * is held. When Alt composes `event.key` (macOS Option), recover the logical
 * key from the physical `event.code`; otherwise `event.key` is layout-aware
 * and stays the source of truth. Numpad and named keys (arrows, Enter)
 * intentionally fall through to `event.key` because Option does not compose
 * them.
 *
 * Known limitation: the recovery table is US-QWERTY, so a composed key on a
 * macOS non-QWERTY layout recovers the QWERTY key for that physical
 * position.
 */
export const getShortcutEventKey = (event: ShortcutKeyboardEvent): string => {
  if (!event.altKey || !isComposedKey(event.key)) {
    return event.key;
  }
  const { code } = event;
  if (code.startsWith("Key") && code.length === 4) {
    const letter = code.slice(3);
    return event.shiftKey ? letter : letter.toLowerCase();
  }
  const mapped = CODE_KEYS[code];
  if (mapped) {
    return event.shiftKey ? mapped[1] : mapped[0];
  }
  return event.key;
};
