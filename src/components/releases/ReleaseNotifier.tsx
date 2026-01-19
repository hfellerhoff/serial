import { ReleaseNotifierClient } from "./ReleaseNotifierClient";

export function ReleaseNotifier({
  mostRecentRelease,
}: {
  mostRecentRelease?: {
    slug: string;
  };
}) {
  if (!mostRecentRelease?.slug) return null;
  return <ReleaseNotifierClient slug={mostRecentRelease.slug} />;
}
