import * as React from "react";

import {
  DropdownMenuContentProps,
  DropdownMenuItemProps,
} from "@radix-ui/react-dropdown-menu";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { useMediaQuery } from "~/lib/hooks/use-media-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export function ResponsiveDropdownMenuItem({
  children,
  ...rest
}: DropdownMenuItemProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return <DropdownMenuItem {...rest}>{children}</DropdownMenuItem>;
  }

  return children;
}

export function ResponsiveDropdownLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <DropdownMenuLabel className={className}>{children}</DropdownMenuLabel>
    );
  }

  return <div className={className}>{children}</div>;
}

interface ResponsiveDropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  description?: string;
  side?: DropdownMenuContentProps["side"];
}
export function ResponsiveDropdown({
  children,
  trigger,
  title,
  description,
  side,
}: ResponsiveDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg p-4"
          align="end"
          sideOffset={4}
          side={side}
        >
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
