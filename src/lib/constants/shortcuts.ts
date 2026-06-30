export const VIM_MOVEMENT_KEYS = {
  UP: "k",
  DOWN: "j",
  LEFT: "h",
  RIGHT: "l",
} as const;

export const SHORTCUT_KEYS = {
  VIEW_1: "1",
  VIEW_2: "2",
  VIEW_3: "3",
  VIEW_4: "4",
  VIEW_5: "5",
  VIEW_6: "6",
  VIEW_7: "7",
  VIEW_8: "8",
  VIEW_9: "9",
  VIEW_10: "0",
  UNREAD: "u",
  READ: "y",
  SAVED: "b",
  TOGGLE_READ: "e",
  TOGGLE_READ_ALT: " ",
  TOGGLE_SAVED: "s",
  MARK_VISIBLE_READ: "Shift+F",
  MARK_SECTION_READ: "f",
  OPEN_ORIGINAL: "o",
  SEND_TO_INSTAPAPER: "Shift+S",
  UNDO: "z",
  ARROW_UP: {
    key: "ArrowUp",
    allowRepeat: true,
    aliases: [VIM_MOVEMENT_KEYS.UP],
  },
  ARROW_DOWN: {
    key: "ArrowDown",
    allowRepeat: true,
    aliases: [VIM_MOVEMENT_KEYS.DOWN],
  },
  ARROW_LEFT: {
    key: "ArrowLeft",
    allowRepeat: true,
    aliases: [VIM_MOVEMENT_KEYS.LEFT],
  },
  ARROW_RIGHT: {
    key: "ArrowRight",
    allowRepeat: true,
    aliases: [VIM_MOVEMENT_KEYS.RIGHT],
  },
  ENTER: "Enter",
  PREV_VIEW: "[",
  NEXT_VIEW: "]",
} as const;

export const MAX_VIEW_SHORTCUTS = 10;

export type ShortcutConfig =
  | string
  | { key: string; allowRepeat?: boolean; aliases?: readonly string[] };

export function getShortcutKey(shortcut: ShortcutConfig): string {
  return typeof shortcut === "string" ? shortcut : shortcut.key;
}

/**
 * Returns every key that should trigger a shortcut, including any aliases
 * (e.g. vim-style movement keys that mirror the arrow keys).
 */
export function getShortcutKeys(shortcut: ShortcutConfig): string[] {
  if (typeof shortcut === "string") return [shortcut];
  return shortcut.aliases
    ? [shortcut.key, ...shortcut.aliases]
    : [shortcut.key];
}

export function getShortcutAllowRepeat(shortcut: ShortcutConfig): boolean {
  return typeof shortcut === "string" ? false : (shortcut.allowRepeat ?? false);
}

export const VIEW_SHORTCUT_KEYS = [
  SHORTCUT_KEYS.VIEW_1,
  SHORTCUT_KEYS.VIEW_2,
  SHORTCUT_KEYS.VIEW_3,
  SHORTCUT_KEYS.VIEW_4,
  SHORTCUT_KEYS.VIEW_5,
  SHORTCUT_KEYS.VIEW_6,
  SHORTCUT_KEYS.VIEW_7,
  SHORTCUT_KEYS.VIEW_8,
  SHORTCUT_KEYS.VIEW_9,
  SHORTCUT_KEYS.VIEW_10,
] as const;
