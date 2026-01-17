"use client";

import { VideoIcon } from "@radix-ui/react-icons";
import { useDialogStore } from "~/components/feed/dialogStore";
import { Button } from "./ui/button";

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
