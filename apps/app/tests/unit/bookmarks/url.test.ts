import { describe, expect, it } from "vitest";
import {
  chooseCanonicalUrl,
  normalizeBookmarkUrl,
  resolveOptionalHttpUrl,
} from "~/server/bookmarks/url";

describe("bookmark URL identity", () => {
  it("normalizes parser-defined components without changing query identity", () => {
    expect(
      normalizeBookmarkUrl(
        "HTTPS://Example.COM:443/a/../article?b=2&a=1#section",
      ),
    ).toBe("https://example.com/article?b=2&a=1");
    expect(normalizeBookmarkUrl("http://example.com/path/")).toBe(
      "http://example.com/path/",
    );
  });

  it("rejects credentials and non-HTTP schemes", () => {
    expect(() => normalizeBookmarkUrl("https://user@example.com/")).toThrow(
      "invalid",
    );
    expect(() => normalizeBookmarkUrl("file:///etc/passwd")).toThrow("invalid");
  });

  it("accepts only same-origin declared canonicals", () => {
    expect(
      chooseCanonicalUrl({
        sourceUrl: "https://example.com/submitted",
        effectiveUrl: "https://example.com/final",
        canonicalUrl: "https://example.com/canonical#fragment",
      }),
    ).toBe("https://example.com/canonical");
    expect(
      chooseCanonicalUrl({
        sourceUrl: "https://example.com/submitted",
        effectiveUrl: "https://example.com/final",
        canonicalUrl: "https://attacker.example/canonical",
      }),
    ).toBe("https://example.com/final");
  });

  it("drops unsafe optional metadata URLs", () => {
    expect(resolveOptionalHttpUrl("/icon.png", "https://example.com/a")).toBe(
      "https://example.com/icon.png",
    );
    expect(
      resolveOptionalHttpUrl("data:image/png;base64,AA", "https://example.com"),
    ).toBeNull();
  });
});
