"use client";

import { useLocation } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { ButtonWithShortcut } from "./ButtonWithShortcut";
import { useDialogStore } from "~/components/feed/dialogStore";

export function AddFeedButton() {
  const launchDialog = useDialogStore((store) => store.launchDialog);
  const location = useLocation();

  if (location.pathname !== "/") return null;

  return (
    <ButtonWithShortcut
      aria-label="Add Feed"
      variant="outline"
      size="icon md:default"
      shortcut="a"
      onClick={() => launchDialog("add-feed")}
    >
      <PlusIcon size={16} />
      <span className="hidden md:block">Add Feed</span>
    </ButtonWithShortcut>
  );
}
