import { describe, expect, it, vi } from "vitest";
import { BOOKMARK_CAPTURE_LIMITS } from "@serial/bookmark-capture";
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
    descriptor: {
      platform: "website",
      contentType: "text",
      orientation: null,
      contentId: null,
      classifierVersion: 1,
    },
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
    expect(result.result.observation).toMatchObject({
      canonicalUrl: "https://example.com/canonical",
      capture: {
        captureSource: "extension-live-dom",
        extractorVersion: "mozilla-readability-0.6",
        sanitizerPolicyVersion: 1,
      },
    });
    expect(result.result.observation.capture?.contentHtml).not.toContain(
      "script",
    );
    expect(result.result.observation.capture?.contentHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
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
    expect(result.observation).toMatchObject({
      canonicalUrl: "https://example.com/final",
      effectiveUrl: "https://example.com/final",
      preview: {
        iconUrl: "https://example.com/favicon.ico",
        thumbnailUrl: "https://example.com/image.jpg",
      },
      capture: { captureSource: "server-static-fetch" },
    });
    expect(result.observation.capture?.contentHtml).toContain(
      'href="https://example.com/next"',
    );
    expect(result.observation.capture?.contentHtml).not.toContain("script");
  });

  it("rejects an oversized DOM before parsing structured data or cloning", () => {
    const structuredData = '{"@type":"VideoObject","name":"large"}';
    const parse = vi.spyOn(JSON, "parse");
    const result = extractStaticCapture({
      sourceUrl: "https://example.com/large",
      effectiveUrl: "https://example.com/large",
      html: `<!doctype html><title>Large page</title>
        <script type="application/ld+json">${structuredData}</script>
        ${"<i></i>".repeat(BOOKMARK_CAPTURE_LIMITS.domElements + 1)}`,
    });

    expect(result.captureFailureReason).toBe("too_large");
    expect(result.observation.capture).toBeNull();
    expect(parse.mock.calls.some(([value]) => value === structuredData)).toBe(
      false,
    );
  });
});
