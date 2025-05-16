"use client";

import { useFlagState } from "~/lib/hooks/useFlagState";
import { type ButtonProps, ResponsiveButton } from "./ui/button";

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
