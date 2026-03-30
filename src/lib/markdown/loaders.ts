import { notFound } from "@tanstack/react-router";
// @ts-expect-error this is fine
import { allBlogPosts, allReleases } from "content-collections";
import type { BlogPost, Release } from "content-collections";

const releases = allReleases as Release[];
const blogPosts = allBlogPosts as BlogPost[];

function sortReleases(a: Release, b: Release) {
  if (a.publish_date < b.publish_date) return 1;
  return -1;
}

export function getMostRecentRelease() {
  return releases.filter((release) => release.public).sort(sortReleases)[0];
}

export function getReleaseWithSlug(slug: string) {
  const release = releases.filter((r) => r.public).find((p) => p.slug === slug);

  if (!release) {
    throw notFound();
  }

  return release;
}

export function getAllReleases() {
  return releases.filter((release) => release.public).sort(sortReleases);
}

function sortBlogPosts(a: BlogPost, b: BlogPost) {
  if (a.publish_date < b.publish_date) return 1;
  return -1;
}

export function getBlogPostWithSlug(slug: string) {
  const post = blogPosts.filter((p) => p.public).find((p) => p.slug === slug);

  if (!post) {
    throw notFound();
  }

  return post;
}

export function getAllBlogPosts() {
  return blogPosts.filter((post) => post.public).sort(sortBlogPosts);
}
