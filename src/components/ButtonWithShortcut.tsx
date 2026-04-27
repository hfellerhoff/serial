"use client";

import { ResponsiveButton } from "./ui/button";
import type { ButtonProps } from "./ui/button";
import { cn } from "~/lib/utils";
import { useShowShortcuts } from "~/lib/hooks/useShowShortcuts";

export const KeyboardShortcutDisplay = ({
  shortcut,
  className,
}: {
  shortcut: string;
  className?: string;
}) => {
  const showShortcuts = useShowShortcuts();

  if (!showShortcuts) return null;

  return (
    <kbd
      className={cn(
        "bg-muted text-foreground absolute -top-1.5 -right-1.5 z-10 hidden h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] leading-none shadow-[0_1px_0_1px_hsl(var(--foreground)/0.2)] md:flex",
        className,
      )}
    >
      {shortcut}
    </kbd>
  );
};

export const ButtonWithShortcut = ({
  shortcut,
  children,
  className,
  ...props
}: ButtonProps & {
  shortcut: string;
}) => {
  return (
    <ResponsiveButton
      className={cn("relative overflow-visible", className)}
      {...props}
    >
      <KeyboardShortcutDisplay
        shortcut={shortcut}
        className="-top-2 -right-3"
      />
      {children}
    </ResponsiveButton>
  );
};
