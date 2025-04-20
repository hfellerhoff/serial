"use client";

import {
  IconCamera,
  IconChartBar,
  IconDashboard,
  IconFileAi,
  IconFileDescription,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconSearch,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { SidebarCategories } from "~/app/(feed)/feed/SidebarCategories";
import { SidebarFeeds } from "~/app/(feed)/feed/SidebarFeeds";
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
import { ButtonWithShortcut } from "./ButtonWithShortcut";
import { SerialLogo } from "./SerialLogo";
import { SidebarViews } from "~/app/(feed)/feed/SidebarViews";

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
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <Sidebar variant="inset" collapsible="offcanvas" side="right">
      <SidebarContent>
        <SidebarFeeds />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <ButtonWithShortcut
                variant="outline"
                className="bg-sidebar border-sidebar-border"
                onClick={() => launchDialog("add-feed")}
                shortcut="a"
              >
                <PlusIcon />
                <span>Add feed</span>
              </ButtonWithShortcut>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
