import { describe, expect, it } from "vitest";
import type { ExtensionCaptureCandidate } from "~/server/bookmarks/contracts";
import {
  extractStaticCapture,
  prepareExtensionCapture,
} from "~/server/bookmarks/extract";

function extensionCandidate(
  overrides: Partial<ExtensionCaptureCandidate> = {},
): ExtensionCaptureCandidate {
  return {
    effectiveUrl: "https://example.com/article",
    title: "Article",
    contentHtml:
      '<article><p>Content</p><script>alert("bad")</script></article>',
    extractorVersion: "mozilla-readability-0.6",
    sanitizerPolicyVersion: 1,
    ...overrides,
  };
}

describe("Page capture preparation", () => {
  it("re-sanitizes extension candidates and computes trusted provenance", () => {
    const result = prepareExtensionCapture({
      sourceUrl: "https://example.com/submitted",
      candidate: extensionCandidate({
        canonicalUrl: "https://example.com/canonical",
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capture).toMatchObject({
      canonicalUrl: "https://example.com/canonical",
      captureSource: "extension-live-dom",
      extractorVersion: "mozilla-readability-0.6",
      sanitizerPolicyVersion: 1,
    });
    expect(result.capture.contentHtml).not.toContain("script");
    expect(result.capture.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("degrades unknown extractor and sanitizer versions", () => {
    expect(
      prepareExtensionCapture({
        sourceUrl: "https://example.com/article",
        candidate: extensionCandidate({ extractorVersion: "unknown" }),
      }),
    ).toEqual({ ok: false, reason: "unsupported_capture_version" });
    expect(
      prepareExtensionCapture({
        sourceUrl: "https://example.com/article",
        candidate: extensionCandidate({ sanitizerPolicyVersion: 2 }),
      }),
    ).toEqual({ ok: false, reason: "unsupported_capture_version" });
  });

  it("extracts static reader content without trusting a cross-origin canonical", () => {
    const result = extractStaticCapture({
      sourceUrl: "https://example.com/submitted",
      effectiveUrl: "https://example.com/final",
      html: `<!doctype html><html><head>
        <title>Static article</title>
        <link rel="canonical" href="https://attacker.example/not-authoritative">
        <link rel="icon" href="/favicon.ico">
        <meta property="og:image" content="/image.jpg">
      </head><body><main><article>
        <h1>Static article</h1>
        <p>This is enough meaningful article text for reader extraction to retain.</p>
        <p><a href="/next">Next article</a></p>
        <script>steal()</script>
      </article></main></body></html>`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capture).toMatchObject({
      canonicalUrl: "https://example.com/final",
      effectiveUrl: "https://example.com/final",
      iconUrl: "https://example.com/favicon.ico",
      representativeImageUrl: "https://example.com/image.jpg",
      captureSource: "server-static-fetch",
    });
    expect(result.capture.contentHtml).toContain(
      'href="https://example.com/next"',
    );
    expect(result.capture.contentHtml).not.toContain("script");
  });
});
