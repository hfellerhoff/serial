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

// Only macOS composes `event.key` under Option; everywhere else the
// layout-aware `event.key` already is the logical key.
const isMacLike = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ?? navigator.platform,
  );

/**
 * Alt is the "peek at shortcuts" key, so shortcuts must still match while it
 * is held. On macOS, Option composes printable `event.key` values into
 * different characters (Option+E → "´", German Option+5 → "["), so recover
 * the logical key from the physical `event.code` for every printable or
 * dead key while Option is down. On other platforms Alt does not compose,
 * so `event.key` is layout-aware and stays the source of truth. Numpad and
 * named keys (arrows, Enter) always fall through to `event.key` because
 * Option does not compose them.
 *
 * Known limitation: the recovery table is US-QWERTY, so on a macOS
 * non-QWERTY layout an Option-held key recovers the QWERTY key for that
 * physical position.
 */
export const getShortcutEventKey = (event: ShortcutKeyboardEvent): string => {
  if (!event.altKey || !isMacLike()) {
    return event.key;
  }
  if (event.key.length > 1 && event.key !== "Dead") {
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
