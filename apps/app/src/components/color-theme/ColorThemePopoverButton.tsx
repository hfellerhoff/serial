"use client";

import { PaletteIcon } from "lucide-react";
import { ResponsiveButton } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { ResponsiveDropdown } from "../ui/responsive-dropdown";
import { AppearanceTabs } from "./AppearanceTabs";
import type React from "react";

export function ColorThemePopoverButton({
  defaultTab,
}: {
  defaultTab?: "design" | "videos" | "articles";
} = {}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ResponsiveButton size="icon" variant="outline">
          <PaletteIcon size={16} />
        </ResponsiveButton>
      </PopoverTrigger>
      <PopoverContent>
        <AppearanceTabs defaultTab={defaultTab} />
      </PopoverContent>
    </Popover>
  );
}

export function ColorThemeDropdownSidebar({
  children,
  defaultTab,
}: {
  children: React.ReactNode;
  defaultTab?: "design" | "videos" | "articles";
}) {
  return (
    <ResponsiveDropdown trigger={children} side="right">
      <AppearanceTabs defaultTab={defaultTab} />
    </ResponsiveDropdown>
  );
}
