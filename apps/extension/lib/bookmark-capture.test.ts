import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { BOOKMARK_CAPTURE_LIMITS } from "@serial/bookmark-capture";
import { extractPageObservation } from "@serial/bookmark-capture/extract";
import { serializeBookmarkRequest } from "./bookmarks";

const YOUTUBE_THUMBNAIL_URL =
  "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg";

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
  it("prefers the current YouTube watch title and channel over stale head metadata", () => {
    const document = new JSDOM(
      `<!doctype html><html><head>
        <title>Stale video - YouTube</title>
        <meta property="og:title" content="Stale video">
        <meta name="author" content="Stale channel">
      </head><body>
        <ytd-watch-metadata>
          <h1><yt-formatted-string>Current video title</yt-formatted-string></h1>
          <div id="owner"><div id="channel-name"><a>Current channel</a></div></div>
        </ytd-watch-metadata>
      </body></html>`,
      { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ).window.document;

    const result = extractPageObservation(document);

    expect(result.capture.title).toBe("Current video title");
    expect(result.capture.author).toBe("Current channel");
  });

  it("prefers the current YouTube Shorts title and structured channel over stale head metadata", () => {
    const document = new JSDOM(
      `<!doctype html><html><head>
        <title>Stale Short - YouTube</title>
        <meta property="og:title" content="Stale Short">
        <meta name="author" content="Stale channel">
      </head><body>
        <yt-shorts-video-title-view-model>
          <h1>Current Short title</h1>
        </yt-shorts-video-title-view-model>
        <span itemprop="author">
          <meta itemprop="name" content="Current Shorts channel">
        </span>
      </body></html>`,
      { url: "https://www.youtube.com/shorts/PG_kfqOXqgQ" },
    ).window.document;

    const result = extractPageObservation(document);

    expect(result.capture.title).toBe("Current Short title");
    expect(result.capture.author).toBe("Current Shorts channel");
  });

  it.each([
    ["Watch", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["Shorts", "https://www.youtube.com/shorts/dQw4w9WgXcQ"],
  ])(
    "prefers the detected YouTube thumbnail for %s pages",
    (_pageType, url) => {
      const document = new JSDOM(
        `<!doctype html><html><head>
          <title>YouTube video</title>
          <meta property="og:image" content="https://metadata.example/standard-youtube.jpg">
        </head><body></body></html>`,
        { url },
      ).window.document;

      const result = extractPageObservation(document);

      expect(result.capture.thumbnailUrl).toBe(YOUTUBE_THUMBNAIL_URL);
    },
  );

  it("chooses the strongest social-image metadata independently of document order", () => {
    const document = pageDocument(
      "<main>Preview only</main>",
      `
        <meta name="twitter:image" content="/images/twitter.jpg">
        <meta property="og:image" content="/images/open-graph.jpg">
      `,
    );

    const result = extractPageObservation(document);

    expect(result.capture.thumbnailUrl).toBe(
      "https://example.com/images/open-graph.jpg",
    );
  });

  it("uses structured article imagery when social metadata is absent", () => {
    const document = pageDocument(
      readableArticle(
        "<p>This article has structured representative imagery.</p>",
      ),
      `
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Article",
            "image": {
              "@type": "ImageObject",
              "url": "/images/structured-cover.jpg",
              "width": 1200,
              "height": 630
            }
          }
        </script>
      `,
    );

    const result = extractPageObservation(document);

    expect(result.capture.thumbnailUrl).toBe(
      "https://example.com/images/structured-cover.jpg",
    );
  });

  it("quality-ranks relative and lazy-loaded article imagery", () => {
    const document = pageDocument(`
      <header>
        <img src="/images/site-logo.png" width="64" height="64" alt="Site logo">
      </header>
      <main>
        <article>
          <img src="/images/author-avatar.jpg" width="96" height="96" alt="Author avatar">
          <img data-src="../images/article-cover.jpg" width="1200" height="630" alt="Article cover">
          ${readableArticle(
            "<p>This article has enough text for reader extraction.</p>",
          )}
        </article>
      </main>
    `);

    const result = extractPageObservation(document);

    expect(result.capture.thumbnailUrl).toBe(
      "https://example.com/images/article-cover.jpg",
    );
  });

  it("leaves imagery empty when every candidate is unsafe or unsuitable", () => {
    const document = pageDocument(
      `
        <main>
          <img src="/images/tracking-pixel.gif" width="1" height="1" alt="Tracking pixel">
          <img src="/images/hidden-cover.jpg" width="1200" height="630" hidden alt="Hidden cover">
          <img src="/images/extreme-banner.jpg" width="2400" height="100" alt="Extreme banner">
        </main>
      `,
      `
        <meta property="og:image" content="javascript:alert('unsafe')">
        <meta name="twitter:image" content="https://user:secret@example.com/private.jpg">
        <script type="application/ld+json">
          { "@type": "Article", "image": "data:image/png;base64,unsafe" }
        </script>
      `,
    );

    const result = extractPageObservation(document);

    expect(result.capture.thumbnailUrl).toBeUndefined();
  });

  it.each([
    {
      name: "website text",
      url: "https://example.com/article",
      head: "",
      platform: "website",
      contentType: "text",
    },
    {
      name: "website video",
      url: "https://example.com/video",
      head: '<meta property="og:type" content="video.other">',
      platform: "website",
      contentType: "video",
    },
    {
      name: "YouTube text",
      url: "https://www.youtube.com/@serial",
      head: "",
      platform: "youtube",
      contentType: "text",
    },
    {
      name: "YouTube video",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      head: "",
      platform: "youtube",
      contentType: "video",
    },
    {
      name: "PeerTube text",
      url: "https://video.example/about",
      head: '<meta name="generator" content="PeerTube">',
      platform: "peertube",
      contentType: "text",
    },
    {
      name: "PeerTube video",
      url: "https://video.example/videos/watch/123e4567-e89b-12d3-a456-426614174000",
      head: "",
      platform: "peertube",
      contentType: "video",
    },
    {
      name: "Nebula text",
      url: "https://nebula.tv/about",
      head: "",
      platform: "nebula",
      contentType: "text",
    },
    {
      name: "Nebula video",
      url: "https://nebula.tv/videos/example-video",
      head: "",
      platform: "nebula",
      contentType: "video",
    },
  ] as const)("fills general preview defaults for $name", (fixture) => {
    const document = new JSDOM(
      `<!doctype html><html><head>
        <title>General preview title</title>
        <meta property="og:image" content="/general-cover.jpg">
        ${fixture.head}
      </head><body><main>Preview only</main></body></html>`,
      { url: fixture.url },
    ).window.document;

    const result = extractPageObservation(document);

    expect(result.capture.descriptor).toMatchObject({
      platform: fixture.platform,
      contentType: fixture.contentType,
    });
    expect(result.capture.title).toBe("General preview title");
    const expectedThumbnailUrl =
      fixture.platform === "youtube" && fixture.contentType === "video"
        ? YOUTUBE_THUMBNAIL_URL
        : `${new URL(fixture.url).origin}/general-cover.jpg`;
    expect(result.capture.thumbnailUrl).toBe(expectedThumbnailUrl);
  });

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
    const structuredData =
      '{"@type":"Article","image":"https://example.com/large.jpg"}';
    const document = pageDocument(
      '<main><p>Article preview</p><img src="/large.jpg"></main>',
      `
        <link rel="alternate" type="application/rss+xml" href="/feed.xml" title="Example Feed">
        <meta property="og:description" content="A lightweight preview">
        <script type="application/ld+json">${structuredData}</script>
      `,
    );
    const querySelectorAll = document.querySelectorAll.bind(document);
    const query = vi
      .spyOn(document, "querySelectorAll")
      .mockImplementation((selector) =>
        selector === "*"
          ? ({ length: BOOKMARK_CAPTURE_LIMITS.domElements + 1 } as never)
          : querySelectorAll(selector),
      );
    const clone = vi.spyOn(document, "cloneNode");
    const parse = vi.spyOn(JSON, "parse");

    const result = extractPageObservation(document);

    expect(clone).not.toHaveBeenCalled();
    expect(parse.mock.calls.some(([value]) => value === structuredData)).toBe(
      false,
    );
    expect(query.mock.calls.some(([selector]) => selector === "img")).toBe(
      false,
    );
    expect(result.capture.description).toBe("A lightweight preview");
    expect(result.capture.contentHtml).toBeUndefined();
    expect(result.captureFailureReason).toBe("too_large");
    expect(result.feeds).toEqual([
      { url: "https://example.com/feed.xml", title: "Example Feed" },
    ]);
  });
});
