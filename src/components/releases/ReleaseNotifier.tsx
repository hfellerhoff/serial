import { useQuery } from "@tanstack/react-query";
import { ReleaseNotifierClient } from "./ReleaseNotifierClient";
import { getMostRecentReleaseServerFn } from "~/server/releases";

export function ReleaseNotifier() {
  const { data: mostRecentRelease } = useQuery({
    queryKey: ["most-recent-release"],
    queryFn: () => getMostRecentReleaseServerFn(),
    staleTime: Infinity,
    retry: false,
  });

  if (!mostRecentRelease?.slug) return null;
  return <ReleaseNotifierClient slug={mostRecentRelease.slug} />;
}
