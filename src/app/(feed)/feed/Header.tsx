"use client";

import { useShortcut } from "~/lib/hooks/useShortcut";
import { TopLeftButton } from "./TopLeftButton";
import { TopRightHeaderContent } from "./TopRightHeaderContent";
import { usePathname, useRouter } from "next/navigation";
import { FeedLoader } from "./FeedLoader";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();

  useShortcut("h", () => {
    if (pathname === "/feed") return;
    router.push("/feed");
  });

  return (
    <header className="top-0 z-20 flex w-full flex-wrap items-center justify-between gap-2 bg-transparent px-6 py-6">
      <span className="inline-flex w-auto items-center justify-start md:w-16">
        <TopLeftButton />
      </span>
      <FeedLoader />
      <span className="inline-flex w-auto items-center justify-end md:w-16">
        <TopRightHeaderContent />
      </span>
    </header>
  );
}
