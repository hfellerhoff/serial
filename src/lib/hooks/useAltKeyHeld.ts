"use client";

import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { altKeyHeldAtom } from "~/lib/data/atoms";

export function useAltKeyHeld() {
  const setAltKeyHeld = useSetAtom(altKeyHeldAtom);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Alt" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        setAltKeyHeld(true);
      } else if (event.shiftKey || event.ctrlKey || event.metaKey) {
        setAltKeyHeld(false);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setAltKeyHeld(false);
      }
    };

    const handleBlur = () => {
      setAltKeyHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [setAltKeyHeld]);
}
