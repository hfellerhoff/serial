import { describe, expect, it } from "vitest";
import { extensionCaptureCandidateSchema } from "~/server/bookmarks/contracts";

describe("extension capture contract", () => {
  it("discards malformed optional metadata field by field", () => {
    const parsed = extensionCaptureCandidateSchema.parse({
      effectiveUrl: "https://example.com/article",
      title: "Article",
      author: "a".repeat(513),
      publishedAt: "not-a-date",
      iconUrl: 42,
      representativeImageUrl: "https://example.com/image.jpg",
      contentHtml: "<p>Content</p>",
      extractorVersion: "mozilla-readability-0.6",
      sanitizerPolicyVersion: 1,
    });
    expect(parsed.author).toBeUndefined();
    expect(parsed.publishedAt).toBeUndefined();
    expect(parsed.iconUrl).toBeUndefined();
    expect(parsed.representativeImageUrl).toBe("https://example.com/image.jpg");
  });

  it("rejects required capture metadata beyond its limits", () => {
    expect(
      extensionCaptureCandidateSchema.safeParse({
        effectiveUrl: "https://example.com/article",
        title: "x".repeat(1_025),
        contentHtml: "<p>Content</p>",
        extractorVersion: "mozilla-readability-0.6",
        sanitizerPolicyVersion: 1,
      }).success,
    ).toBe(false);
  });
});
