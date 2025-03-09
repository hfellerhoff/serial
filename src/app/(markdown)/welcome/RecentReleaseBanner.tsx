import Link from "next/link";
import { getReleasePages } from "~/lib/markdown/releases";

export async function RecentReleaseBanner() {
  const releases = await getReleasePages();
  const mostRecentRelease = releases?.[0];

  if (!mostRecentRelease) return null;

  return (
    <>
      <Link
        href={`/releases/${mostRecentRelease.slug}`}
        className="bg-foreground text-background hover:bg-bg-foreground hover:text-background fixed inset-x-0 top-0 flex h-12 items-center justify-center text-center hover:underline"
      >
        New Release: {mostRecentRelease.frontmatter.title} →
      </Link>
      <div className="h-12" />
    </>
  );
}
