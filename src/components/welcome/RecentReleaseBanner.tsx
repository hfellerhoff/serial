import { Link } from "@tanstack/react-router";
import type { Release } from "content-collections";

export function RecentReleaseBanner({
  mostRecentRelease,
}: {
  mostRecentRelease: Release | undefined;
}) {
  if (!mostRecentRelease) return null;

  return (
    <>
      <Link
        to="/releases/$slug"
        params={{ slug: mostRecentRelease.slug }}
        className="bg-foreground text-background hover:bg-bg-foreground hover:text-background z-10 flex h-12 items-center justify-center text-center hover:underline"
      >
        New Release: {mostRecentRelease.title} →
      </Link>
    </>
  );
}
