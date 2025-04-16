"use client";

import { useFlagState } from "~/lib/hooks/useFlagState";
import { Button, type ButtonProps, ResponsiveButton } from "./ui/button";
import React from "react";

export const ButtonWithShortcut = ({
  shortcut,
  children,
  ...props
}: ButtonProps & {
  shortcut: string;
}) => {
  const [shortcutDisplay] = useFlagState("INLINE_SHORTCUTS");
  const showShortcuts = shortcutDisplay === "show-shortcuts";

  return (
    <ResponsiveButton {...props}>
      {children}
      {showShortcuts && (
        <kbd className="bg-muted hidden rounded px-1 md:ml-1.5 md:inline-block">
          {shortcut}
        </kbd>
      )}
    </ResponsiveButton>
  );
};
