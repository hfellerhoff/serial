"use client";

import { useLocation, useRouter } from "@tanstack/react-router";
import { useShortcut } from "~/lib/hooks/useShortcut";
import { FeedLoader } from "./FeedLoader";
import { TopLeftButton } from "./TopLeftButton";
import { TopRightHeaderContent } from "./TopRightHeaderContent";

export function Header() {
  const location = useLocation();
  const router = useRouter();

  useShortcut("h", () => {
    if (location.pathname === "/") return;
    router.navigate({
      to: "/",
    });
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
