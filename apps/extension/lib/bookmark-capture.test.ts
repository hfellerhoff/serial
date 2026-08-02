import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  BOOKMARK_CAPTURE_LIMITS,
  extractPageObservation,
} from "@serial/bookmark-capture";
import { serializeBookmarkRequest } from "./bookmarks";

function pageDocument(body: string, head = "") {
  return new JSDOM(
    `<!doctype html><html><head><title>Fixture article</title>${head}</head><body>${body}</body></html>`,
    { url: "https://example.com/articles/fixture" },
  ).window.document;
}

function readableArticle(content: string) {
  return `<article><h1>Fixture article</h1>${content.repeat(8)}</article>`;
}

describe("extension live DOM Bookmark capture", () => {
  it("extracts a clone, resolves lazy and relative URLs, and discovers Feeds", () => {
    const document = pageDocument(
      readableArticle(`
        <p>This is a sufficiently detailed article paragraph for Readability.</p>
        <a href="../about">About</a>
        <img data-src="/images/cover.jpg" alt="Cover">
      `),
      `
        <link rel="canonical" href="/articles/canonical">
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Example Feed">
        <meta property="og:description" content="A useful description">
        <meta property="og:site_name" content="Example">
      `,
    );

    const result = extractPageObservation(document);

    expect(result.sourceUrl).toBe("https://example.com/articles/fixture");
    expect(result.capture.canonicalUrl).toBe(
      "https://example.com/articles/canonical",
    );
    expect(result.capture.description).toBe("A useful description");
    expect(result.capture.siteName).toBe("Example");
    expect(result.capture.contentHtml).toContain("https://example.com/about");
    expect(result.capture.contentHtml).toContain(
      "https://example.com/images/cover.jpg",
    );
    expect(result.feeds).toEqual([
      { url: "https://example.com/feed.xml", title: "Example Feed" },
    ]);
    expect(document.querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("converts supported YouTube embeds and removes unsafe page material", () => {
    const secret = "private-pre-extraction-source";
    const document = pageDocument(
      readableArticle(`
        <p onclick="steal()">Readable copy</p>
        <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"></iframe>
        <iframe src="https://tracker.example/embed/private"></iframe>
        <form><input value="credential"></form>
        <script>${secret}</script>
      `),
    );

    const result = extractPageObservation(document);
    const serialized = JSON.stringify(result);

    expect(result.capture.contentHtml).toContain('data-serial-embed="youtube"');
    expect(result.capture.contentHtml).toContain('data-start="42"');
    expect(result.capture.contentHtml).not.toContain("tracker.example");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("onclick");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("<form");
    expect(Object.keys(result)).toEqual(["sourceUrl", "capture", "feeds"]);
  });

  it("keeps video metadata but prohibits Page capture for unsupported content", () => {
    const document = new JSDOM(
      "<!doctype html><title>Video</title><meta property='og:type' content='video.other'><article><p>Video notes</p></article>",
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ).window.document;

    const result = extractPageObservation(document);

    expect(result.capture.descriptor).toMatchObject({
      platform: "youtube",
      contentType: "video",
      contentId: "dQw4w9WgXcQ",
    });
    expect(result.capture.contentHtml).toBeUndefined();
    expect(result.captureFailureReason).toBe("unsupported_content");
  });

  it("rejects credential-bearing page URLs before producing an observation", () => {
    const document = new JSDOM(readableArticle("<p>Private article.</p>"), {
      url: "https://user:secret@example.com/private",
    }).window.document;

    expect(() => extractPageObservation(document)).toThrow(
      "The page URL is not eligible for capture",
    );
  });

  it("preflights oversized payloads and degrades to preview-only JSON", () => {
    const observation = extractPageObservation(
      pageDocument(readableArticle("<p>Readable content.</p>")),
    );
    observation.capture.contentHtml = "x".repeat(
      BOOKMARK_CAPTURE_LIMITS.extensionRequestBytes,
    );
    observation.capture.extractorVersion = "mozilla-readability-0.6";
    observation.capture.sanitizerPolicyVersion = 1;

    const result = serializeBookmarkRequest(observation);
    const parsed = JSON.parse(result.serialized) as {
      capture: Record<string, unknown>;
    };

    expect(result.degraded).toBe(true);
    expect(parsed).toMatchObject({ feeds: observation.feeds });
    expect(parsed.capture.contentHtml).toBeUndefined();
    expect(parsed.capture.extractorVersion).toBeUndefined();
    expect(parsed.capture.sanitizerPolicyVersion).toBeUndefined();
    expect(parsed).toMatchObject({ captureFailureReason: "too_large" });
    expect(new TextEncoder().encode(result.serialized).byteLength).toBeLessThan(
      BOOKMARK_CAPTURE_LIMITS.extensionRequestBytes,
    );
  });

  it("does not clone an oversized DOM but retains preview and declared Feeds", () => {
    const document = pageDocument(
      "<main><p>Article preview</p></main>",
      `
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Example Feed">
        <meta property="og:description" content="A lightweight preview">
      `,
    );
    const querySelectorAll = document.querySelectorAll.bind(document);
    vi.spyOn(document, "querySelectorAll").mockImplementation((selector) =>
      selector === "*"
        ? ({ length: BOOKMARK_CAPTURE_LIMITS.domElements + 1 } as never)
        : querySelectorAll(selector),
    );
    const clone = vi.spyOn(document, "cloneNode");

    const result = extractPageObservation(document);

    expect(clone).not.toHaveBeenCalled();
    expect(result.capture.description).toBe("A lightweight preview");
    expect(result.capture.contentHtml).toBeUndefined();
    expect(result.captureFailureReason).toBe("too_large");
    expect(result.feeds).toEqual([
      { url: "https://example.com/feed.xml", title: "Example Feed" },
    ]);
  });
});
