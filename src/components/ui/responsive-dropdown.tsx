import * as React from "react";

import { ArrowLeftIcon, XIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import type {
  DropdownMenuContentProps,
  DropdownMenuItemProps,
} from "@radix-ui/react-dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { useMediaQuery } from "~/lib/hooks/use-media-query";

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

interface ControlledResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  onBack?: () => void;
  headerRight?: React.ReactNode;
  onOpenAutoFocus?: (event: Event) => void;
}
export function ControlledResponsiveDialog({
  open,
  onOpenChange,
  children,
  title,
  description,
  onBack,
  headerRight,
  onOpenAutoFocus,
}: ControlledResponsiveDialogProps) {
  const isDesktop = useMediaQuery("(min-width: 640px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent hideClose onOpenAutoFocus={onOpenAutoFocus}>
          <DialogHeader>
            {onBack && (
              <button
                onClick={onBack}
                className="text-muted-foreground hover:text-foreground mb-4 flex w-fit items-center gap-1 text-sm transition-colors"
              >
                <ArrowLeftIcon size={16} />
                <span>Back</span>
              </button>
            )}
            <div className="flex items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              <div className="flex items-center gap-3">
                {headerRight}
                <DialogClose className="ring-offset-background focus:ring-ring rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden">
                  <XIcon className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogClose>
              </div>
            </div>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          {onBack && (
            <button
              onClick={onBack}
              className="text-muted-foreground hover:text-foreground mb-2 flex w-fit items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeftIcon size={16} />
              <span>Back</span>
            </button>
          )}
          <div className="flex items-center justify-between">
            <DrawerTitle>{title}</DrawerTitle>
            {headerRight}
          </div>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-4">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
