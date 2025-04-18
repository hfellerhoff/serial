"use client";

import * as React from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import {
  CircleHelpIcon,
  HelpingHandIcon,
  LifeBuoyIcon,
  LightbulbIcon,
  MailIcon,
  NotebookIcon,
  PaletteIcon,
} from "lucide-react";
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
