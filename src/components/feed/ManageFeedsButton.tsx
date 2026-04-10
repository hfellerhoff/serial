"use client";

import { useLocation, useNavigate } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { useCallback } from "react";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";
import { useShortcut } from "~/lib/hooks/useShortcut";

export function ManageFeedsButton() {
  const location = useLocation();
  const navigate = useNavigate();

  const onClick = useCallback(() => {
    void navigate({ to: "/feeds" });
  }, [navigate]);

  useShortcut("m", onClick);

  if (location.pathname !== "/") return null;

  return (
    <ButtonWithShortcut
      size="icon md:default"
      variant="outline"
      onClick={onClick}
      shortcut="m"
    >
      <SettingsIcon size={16} />
      <span className="hidden pl-1.5 md:block">Manage</span>
    </ButtonWithShortcut>
  );
}
