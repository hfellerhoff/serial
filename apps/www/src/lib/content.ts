import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";

type Dated = { data: { publish_date: string } };

function byNewestFirst(a: Dated, b: Dated) {
  if (a.data.publish_date < b.data.publish_date) return 1;
  return -1;
}

export async function getAllGuides(): Promise<CollectionEntry<"guides">[]> {
  const guides = await getCollection("guides", ({ data }) => data.public);
  return guides.sort(byNewestFirst);
}

export async function getAllReleases(): Promise<CollectionEntry<"releases">[]> {
  const releases = await getCollection("releases", ({ data }) => data.public);
  return releases.sort(byNewestFirst);
}

export async function getMostRecentRelease() {
  const releases = await getAllReleases();
  return releases[0];
}
