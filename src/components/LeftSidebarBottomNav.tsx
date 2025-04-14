"use client";

import * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { NotebookIcon, PaletteIcon } from "lucide-react";
import Link from "next/link";
import { ColorThemeDropdownSidebar } from "./color-theme/ColorThemePopoverButton";

export function LeftSidebarBottomNav() {
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <ColorThemeDropdownSidebar>
              <SidebarMenuButton>
                <PaletteIcon />
                <span>Appearance</span>
              </SidebarMenuButton>
            </ColorThemeDropdownSidebar>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/releases">
                <NotebookIcon />
                <span>Release Log</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
