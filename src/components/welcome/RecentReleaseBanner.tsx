import { Link } from "@tanstack/react-router";
import { Release } from "content-collections";

export async function RecentReleaseBanner({
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
        className="bg-foreground text-background hover:bg-bg-foreground hover:text-background fixed inset-x-0 top-0 z-10 flex h-12 items-center justify-center text-center hover:underline"
      >
        New Release: {mostRecentRelease.title} →
      </Link>
      <div className="h-12" />
    </>
  );
}
