"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { useFlagState } from "~/lib/hooks/useFlagState";
import { type ButtonProps, ResponsiveButton } from "./ui/button";

const kbdVariants = cva("hidden rounded px-1 md:ml-1.5 md:inline-block", {
  variants: {
    variant: {
      default: "bg-muted",
      destructive: "bg-destructive-foreground/20 text-destructive-foreground",
      outline: "bg-muted",
      secondary: "bg-muted",
      ghost: "bg-muted",
      link: "bg-muted",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export const ButtonWithShortcut = ({
  shortcut,
  children,
  variant,
  ...props
}: ButtonProps & {
  shortcut: string;
}) => {
  const [shortcutDisplay] = useFlagState("INLINE_SHORTCUTS");
  const showShortcuts = shortcutDisplay === "show-shortcuts";

  return (
    <ResponsiveButton variant={variant} {...props}>
      {children}
      {showShortcuts && (
        <kbd className={kbdVariants({ variant })}>{shortcut}</kbd>
      )}
    </ResponsiveButton>
  );
};
