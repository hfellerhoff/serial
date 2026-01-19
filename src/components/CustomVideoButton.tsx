"use client";

import { VideoIcon } from "@radix-ui/react-icons";
import { Button } from "./ui/button";
import { useDialogStore } from "~/components/feed/dialogStore";

export function CustomVideoButton() {
  const launchDialog = useDialogStore((store) => store.launchDialog);

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => launchDialog("custom-video")}
    >
      <VideoIcon />
    </Button>
  );
}
