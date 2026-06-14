import { describe, expect, it } from "vitest";
import { buildReleaseMetadata } from "~/lib/og/releaseMetadata";

const release = {
  slug: "2026-06-10",
  title: "View sections",
  description: "Custom view sections and better navigation.",
  publish_date: "2026-06-10",
  public: true,
  content: "",
  excerpt: "",
};

describe("buildReleaseMetadata", () => {
  it("builds absolute release and image metadata", () => {
    const metadata = buildReleaseMetadata(release, "https://serial.tube");

    expect(metadata.links).toContainEqual({
      rel: "canonical",
      href: "https://serial.tube/releases/2026-06-10",
    });
    expect(metadata.meta).toContainEqual({
      property: "og:image",
      content: "https://serial.tube/api/og/releases/2026-06-10",
    });
    expect(metadata.meta).toContainEqual({
      name: "twitter:card",
      content: "summary_large_image",
    });
    expect(metadata.meta).toContainEqual({
      property: "article:published_time",
      content: "2026-06-10",
    });
  });

  it("provides a description when a release has none", () => {
    const metadata = buildReleaseMetadata(
      { ...release, description: undefined },
      "https://serial.tube",
    );

    expect(metadata.meta).toContainEqual({
      name: "description",
      content: "Release notes for View sections",
    });
  });
});
