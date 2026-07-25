import { describe, expect, it } from "vitest";
import { normalizeFeedSearchUrl } from "../../../src/components/feed-discovery/feedSearchOptions";

describe("normalizeFeedSearchUrl", () => {
  it("accepts explicit and domain-like URLs", () => {
    expect(normalizeFeedSearchUrl("nytimes.com/rss")).toBe(
      "https://nytimes.com/rss",
    );
    expect(normalizeFeedSearchUrl("http://127.0.0.1:3003/feed")).toBe(
      "http://127.0.0.1:3003/feed",
    );
  });

  it("leaves plain search terms for curated fuzzy matching", () => {
    expect(normalizeFeedSearchUrl("dropout")).toBeNull();
    expect(normalizeFeedSearchUrl("ny times")).toBeNull();
  });
});
