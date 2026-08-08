"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import type * as React from "react";
import type { VariantProps } from "class-variance-authority";

import { toggleVariants } from "~/components/ui/component-variants";
import { cn } from "~/lib/utils";

const Toggle = ({
  className,
  variant,
  size,
  ref,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants> &
  React.RefAttributes<React.ElementRef<typeof TogglePrimitive.Root>>) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size }), className)}
    {...props}
  />
);

Toggle.displayName = TogglePrimitive.Root.displayName;

export { Toggle };
