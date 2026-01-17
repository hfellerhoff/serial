import { notFound } from "@tanstack/react-router";
// @ts-expect-error this is fine
import { allReleases, Release } from "content-collections";

let releases = allReleases as Release[];

function sortReleases(a: Release, b: Release) {
  if (a.publish_date < b.publish_date) return 1;
  return -1;
}

export function getMostRecentRelease() {
  return releases.filter((release) => release.public).sort(sortReleases)[0];
}

export function getReleaseWithSlug(slug: string) {
  const release = releases
    .filter((release) => release.public)
    .find((p) => p.slug === slug);

  if (!release) {
    throw notFound();
  }

  return release;
}

export function getAllReleases() {
  return releases.filter((release) => release.public).sort(sortReleases);
}
