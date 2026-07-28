"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type * as React from "react";

import { cn } from "~/lib/utils";

const Progress = ({
  className,
  value,
  ref,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  React.RefAttributes<React.ElementRef<typeof ProgressPrimitive.Root>>) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      "bg-muted relative h-2 w-full overflow-hidden rounded-full",
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="bg-muted-foreground h-full w-full flex-1 transition-all"
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </ProgressPrimitive.Root>
);
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
