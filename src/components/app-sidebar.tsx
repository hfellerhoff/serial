"use client";

import Link from "next/link";
import { SidebarCategories } from "~/app/(feed)/feed/SidebarCategories";
import { SidebarFeeds } from "~/app/(feed)/feed/SidebarFeeds";
import { SidebarViews } from "~/app/(feed)/feed/SidebarViews";
import { UserManagementNavItem } from "~/app/(feed)/feed/UserManagementButton";
import { LeftSidebarBottomNav } from "~/components/LeftSidebarBottomNav";
import { LeftSidebarMain } from "~/components/LeftSidebarMain";
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
              <Link href="/feed" onClick={onNavigate}>
                <SerialLogo className="size-8" />
                <span className="font-mono text-base font-semibold">
                  Serial
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <LeftSidebarMain />
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
