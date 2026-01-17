"use client";

import { Link, useLocation } from "@tanstack/react-router";
import {
  HomeIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from "lucide-react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useSidebar } from "~/components/ui/sidebar";

export function TopLeftButton() {
  const location = useLocation();
  const { toggleSidebar, openLeftMobile, isMobile } = useSidebar();

  if (location.pathname !== "/") {
    return (
      <div className="flex gap-2">
        <ButtonWithShortcut
          shortcut="\"
          onClick={() => toggleSidebar("left")}
          size="icon"
          variant="outline"
        >
          {isMobile && openLeftMobile && <PanelLeftCloseIcon size={16} />}
          {isMobile && !openLeftMobile && <PanelLeftOpenIcon size={16} />}
          {!isMobile && <MenuIcon size={16} />}
          <span className="hidden pl-1 md:block">Menu</span>
        </ButtonWithShortcut>
        <Link to="/">
          <ButtonWithShortcut size="icon" shortcut="h" variant="outline">
            <HomeIcon size={16} />
            <span className="hidden pl-1 md:block">Home</span>
          </ButtonWithShortcut>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <ButtonWithShortcut
        shortcut="\"
        onClick={() => toggleSidebar("left")}
        size="icon"
        variant="outline"
      >
        {isMobile && openLeftMobile && <PanelLeftCloseIcon size={16} />}
        {isMobile && !openLeftMobile && <PanelLeftOpenIcon size={16} />}
        {!isMobile && <MenuIcon size={16} />}
        <span className="hidden pl-1 md:block">Menu</span>
      </ButtonWithShortcut>
    </div>
  );
}
