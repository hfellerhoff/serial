"use client";

import {
  LifeBuoyIcon,
  LightbulbIcon,
  NotebookIcon,
  PaletteIcon,
  ShieldIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ColorThemeDropdownSidebar } from "./color-theme/ColorThemePopoverButton";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { useSession } from "~/lib/auth-client";

export function LeftSidebarBottomNav() {
  const { data } = useSession();
  const isAdmin = data?.user.role === "admin";

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
              <Link to="/releases">
                <NotebookIcon />
                <span>Release Log</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/hfellerhoff/serial/issues/new?template=bug-report.md"
              >
                <LifeBuoyIcon />
                <span>Report Issue</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://github.com/hfellerhoff/serial/issues/new?template=feature_request.md"
              >
                <LightbulbIcon />
                <span>Share Idea</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/admin/settings">
                  <ShieldIcon />
                  <span>Admin</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
