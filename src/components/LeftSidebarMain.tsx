"use client";

import { HomeIcon, ListIcon } from "lucide-react";
import Link from "next/link";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "~/components/ui/sidebar";

export function LeftSidebarMain() {
  const { toggleSidebar, isMobile } = useSidebar();

  const onNavigate = () => {
    if (isMobile) {
      toggleSidebar("left");
    }
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/feed" onClick={onNavigate}>
                <HomeIcon />
                <span>Home</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuButton asChild>
              <Link href="/feed/edit" onClick={onNavigate}>
                <ListIcon />
                <span>Feeds</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
