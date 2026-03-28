"use client";

import { cva } from "class-variance-authority";
import { ResponsiveButton } from "./ui/button";
import type { ButtonProps } from "./ui/button";
import { useFlagState } from "~/lib/hooks/useFlagState";

const kbdVariants = cva("hidden rounded px-1 text-xs md:inline-block", {
  variants: {
    variant: {
      default: "bg-muted",
      destructive: "bg-destructive-foreground/20 text-destructive-foreground",
      outline: "bg-muted",
      secondary: "bg-muted",
      ghost: "bg-muted",
      link: "bg-muted",
    },
    position: {
      left: "md:mr-1.5",
      right: "md:ml-1.5",
    },
    isActive: {
      true: "!bg-foreground text-background",
      false: "bg-muted",
    },
  },
  defaultVariants: {
    variant: "default",
    position: "right",
    isActive: false,
  },
});

export const KeyboardShortcutDisplay = ({
  shortcut,
  variant,
  position = "right",
  isActive,
}: {
  shortcut: string;
  variant?: ButtonProps["variant"];
  position?: "left" | "right";
  isActive?: boolean;
}) => {
  const [shortcutDisplay] = useFlagState("INLINE_SHORTCUTS");
  const showShortcuts = shortcutDisplay === "show-shortcuts";

  if (!showShortcuts) return null;

  return (
    <kbd className={kbdVariants({ variant, position, isActive })}>
      {shortcut}
    </kbd>
  );
};

export const ButtonWithShortcut = ({
  shortcut,
  shortcutPosition = "right",
  children,
  variant,
  ...props
}: ButtonProps & {
  shortcut: string;
  shortcutPosition?: "left" | "right";
}) => {
  return (
    <ResponsiveButton variant={variant} {...props}>
      {shortcutPosition === "left" && (
        <KeyboardShortcutDisplay
          shortcut={shortcut}
          variant={variant}
          position="left"
        />
      )}
      {children}
      {shortcutPosition === "right" && (
        <KeyboardShortcutDisplay
          shortcut={shortcut}
          variant={variant}
          position="right"
        />
      )}
    </ResponsiveButton>
  );
};
