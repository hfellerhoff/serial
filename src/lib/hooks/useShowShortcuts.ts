"use client";

import { useAtomValue } from "jotai";
import { altKeyHeldAtom } from "~/lib/data/atoms";
import { useFlagState } from "~/lib/hooks/useFlagState";

export function useShowShortcuts() {
  const [shortcutDisplay] = useFlagState("INLINE_SHORTCUTS");
  const altKeyHeld = useAtomValue(altKeyHeldAtom);
  return shortcutDisplay === "show-shortcuts" || altKeyHeld;
}
