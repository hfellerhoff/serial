"use client";

import { SidebarCategories } from "~/components/feed/SidebarCategories";
import { SidebarFeeds } from "~/components/feed/SidebarFeeds";
import { SidebarViews } from "~/components/feed/SidebarViews";
import { UserManagementNavItem } from "~/components/feed/UserManagementButton";
import { LeftSidebarBottomNav } from "~/components/LeftSidebarBottomNav";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";
import { SerialLogo } from "./SerialLogo";
import { Link } from "@tanstack/react-router";

export function AppLeftSidebar() {
  const { toggleSidebar, isMobile } = useSidebar();

  const onNavigate = () => {
    if (isMobile) {
      toggleSidebar("left");
    }
  };

  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="-mx-0.5 h-12 data-[slot=sidebar-menu-button]:!p-2"
            >
              <Link to="/" onClick={onNavigate}>
                <SerialLogo className="size-8" />
                <span className="font-mono text-base font-semibold">
                  Serial
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarViews />
        <SidebarCategories />
      </SidebarContent>
      <SidebarFooter>
        <LeftSidebarBottomNav />
        <UserManagementNavItem />
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppRightSidebar() {
  return (
    <Sidebar variant="inset" collapsible="offcanvas" side="right">
      <SidebarContent>
        <SidebarFeeds />
      </SidebarContent>
    </Sidebar>
  );
}
