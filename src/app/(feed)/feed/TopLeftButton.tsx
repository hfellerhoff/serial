"use client";

import { UserButton } from "@clerk/nextjs";
import { HomeIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";

export function TopLeftButton() {
  const pathname = usePathname();

  if (pathname !== "/feed") {
    return (
      <Link href="/feed">
        <Button size="icon" variant="outline">
          <HomeIcon size={16} />
        </Button>
      </Link>
    );
  }

  return (
    <div className="h-8 w-8 flex-shrink-0">
      <UserButton afterSignOutUrl="/welcome" />
    </div>
  );
}
