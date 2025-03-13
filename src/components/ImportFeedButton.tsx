"use client";

import { useDialogStore } from "~/app/(feed)/feed/dialogStore";
import { Button } from "./ui/button";
import { ImportIcon } from "lucide-react";
import Link from "next/link";

export function ImportFeedButton() {
  return (
    <Link href="/feed/import">
      <Button variant="outline" size="icon md:default">
        <ImportIcon size={16} />
        <span className="hidden md:block">Import</span>
      </Button>
    </Link>
  );
}
