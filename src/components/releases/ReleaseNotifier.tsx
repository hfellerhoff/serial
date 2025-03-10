import { getPublishedReleaseSlugs } from "~/lib/markdown/releases";
import { ReleaseNotifierClient } from "./ReleaseNotifierClient";

export async function ReleaseNotifier() {
  const releases = await getPublishedReleaseSlugs();

  return <ReleaseNotifierClient slug={releases?.[0]?.slug} />;
}
