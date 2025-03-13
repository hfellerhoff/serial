"use client";

import { PlusIcon } from "@radix-ui/react-icons";
import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { Button } from "./ui/button";

export function AddFeedButton() {
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <Button
      variant="outline"
      size="icon md:default"
      onClick={() => launchDialog("add-feed")}
    >
      <PlusIcon />
      <span className="hidden md:block">Add</span>
    </Button>
  );
}
