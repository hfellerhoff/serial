"use client";

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { connectionStateAtom } from "~/lib/data/atoms";

const OFFLINE_BANNER_DELAY_MS = 1_000;

export function OfflineBanner() {
  const connectionState = useAtomValue(connectionStateAtom);

  if (connectionState !== "disconnected") return null;

  return <DelayedOfflineBanner />;
}

function DelayedOfflineBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(true), OFFLINE_BANNER_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="bg-sidebar text-sidebar-foreground shrink-0 px-4 py-2 text-center text-sm font-medium"
      role="status"
    >
      Offline, some features may be disabled
    </div>
  );
}
