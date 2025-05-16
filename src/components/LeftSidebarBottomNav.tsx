"use client";

import {
  LifeBuoyIcon,
  LightbulbIcon,
  NotebookIcon,
  PaletteIcon,
} from "lucide-react";
import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
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
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/hfellerhoff/serial/issues/new?template=bug-report.md"
              >
                <LifeBuoyIcon />
                <span>Report Issue</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/hfellerhoff/serial/issues/new?template=feature_request.md"
              >
                <LightbulbIcon />
                <span>Share Idea</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
