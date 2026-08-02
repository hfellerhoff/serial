"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Command as CommandPrimitive } from "cmdk";
import type * as React from "react";

import { cn } from "./lib/cn";

export const Command = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive>>) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
      className,
    )}
    {...props}
  />
);

export const CommandInput = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Input>>) => (
  <div className="flex items-center border-b px-3" data-cmdk-input-wrapper="">
    <MagnifyingGlassIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  </div>
);

export const CommandList = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.List>>) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn("max-h-[300px] overflow-x-hidden overflow-y-auto", className)}
    {...props}
  />
);

export const CommandEmpty = ({
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Empty>>) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm"
    {...props}
  />
);

export const CommandGroup = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Group>>) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
      className,
    )}
    {...props}
  />
);

export const CommandItem = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item> &
  React.RefAttributes<React.ElementRef<typeof CommandPrimitive.Item>>) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "aria-selected:bg-accent aria-selected:text-accent-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50",
      className,
    )}
    {...props}
  />
);
