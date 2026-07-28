"use client";

import { useEffect, useState } from "react";
import { BookmarkIcon, DownloadIcon } from "lucide-react";
import { IS_DEMO_INSTANCE } from "~/lib/demo";
import { useDialogStore } from "~/components/feed/dialogStore";
import { Button } from "~/components/ui/button";

function getNextMidnightUTC() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function DemoBanner() {
  const [countdown, setCountdown] = useState("");
  const { launchDialog } = useDialogStore();

  useEffect(() => {
    if (!IS_DEMO_INSTANCE) return;

    const update = () => {
      const nextMidnight = getNextMidnightUTC();
      const now = new Date();
      const diff = nextMidnight.getTime() - now.getTime();
      setCountdown(formatCountdown(diff));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!IS_DEMO_INSTANCE) {
    return null;
  }

  return (
    <div className="@container shrink-0 bg-amber-500 text-amber-950">
      <div className="mx-auto flex w-full max-w-full flex-col items-center gap-2 px-2 py-4 @xl:flex-row @xl:py-2">
        <div className="hidden flex-1 @xl:flex" />
        <div className="flex flex-none items-center gap-2 text-xs font-medium @lg:text-sm">
          <BookmarkIcon size={16} />
          <span>
            This is a demo instance. All data will be deleted in{" "}
            <strong className="font-mono">{countdown}</strong>.
          </span>
        </div>
        <div className="flex flex-1 justify-end">
          <Button
            size="sm"
            className="flex items-center gap-1.5"
            onClick={() =>
              launchDialog("edit-user-profile", { settingsPane: "export" })
            }
          >
            <DownloadIcon size={14} />
            Export Data
          </Button>
        </div>
      </div>
    </div>
  );
}
