"use client";

import { HomeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { UserManagementPopoverButton } from "./UserManagementButton";
import { ButtonWithShortcut } from "~/components/ButtonWithShortcut";

export function TopLeftButton() {
  const pathname = usePathname();

  if (pathname !== "/feed") {
    return (
      <Link href="/feed">
        <ButtonWithShortcut size="icon" shortcut="esc" variant="outline">
          <HomeIcon size={16} />
        </ButtonWithShortcut>
      </Link>
    );
  }

  return (
    <div className="h-8 w-8 shrink-0">
      <UserManagementPopoverButton />
    </div>
  );
}
