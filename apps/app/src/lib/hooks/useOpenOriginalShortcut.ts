"use client";

import { SHORTCUT_KEYS } from "../constants/shortcuts";
import { useShortcut } from "./useShortcut";

export function useOpenOriginalShortcut(url: string | undefined) {
  useShortcut(SHORTCUT_KEYS.OPEN_ORIGINAL, () => {
    if (url) {
      window.open(url, "_blank", "noopener noreferrer");
    }
  });
}
