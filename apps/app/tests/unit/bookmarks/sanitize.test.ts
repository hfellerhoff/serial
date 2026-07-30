import { describe, expect, it } from "vitest";
import { sanitizeCaptureHtml } from "~/server/bookmarks/sanitize";

describe("Page capture sanitization", () => {
  it("keeps reader HTML while stripping active and identifying markup", () => {
    const result = sanitizeCaptureHtml({
      effectiveUrl: "https://example.com/articles/post",
      contentHtml: `
        <article class="tracking" onclick="steal()" data-secret="value">
          <style>body { display: none }</style><script>steal()</script>
          <h1>Title</h1><form><input value="private"></form>
          <p><a href="/next">Next</a><img src="../image.jpg" referrerpolicy="unsafe-url"></p>
        </article>`,
    });

    expect(result.contentHtml).toContain("<article>");
    expect(result.contentHtml).toContain('href="https://example.com/next"');
    expect(result.contentHtml).toContain('src="https://example.com/image.jpg"');
    expect(result.contentHtml).not.toMatch(
      /script|style|form|input|onclick|class|secret|referrerpolicy/,
    );
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects dangerous URLs and an entirely invalid srcset", () => {
    const result = sanitizeCaptureHtml({
      effectiveUrl: "https://example.com/article",
      contentHtml: `
        <p><a href="javascript:alert(1)">Bad</a></p>
        <img src="data:image/png;base64,AA" srcset="/ok.png 1x, javascript:bad 2x">`,
    });
    expect(result.contentHtml).not.toContain("javascript:");
    expect(result.contentHtml).not.toContain("data:image");
    expect(result.contentHtml).not.toContain("srcset");
  });

  it("rewrites ids and matching fragment links deterministically", () => {
    const result = sanitizeCaptureHtml({
      effectiveUrl: "https://example.com/article",
      contentHtml: '<p id="note:1">Note</p><a href="#note:1">Back</a>',
    });
    expect(result.contentHtml).toMatch(/id="capture-[a-f0-9]{12}-note-1"/);
    expect(result.contentHtml).toMatch(/href="#capture-[a-f0-9]{12}-note-1"/);
  });

  it("converts only constrained YouTube embeds to typed placeholders", () => {
    const result = sanitizeCaptureHtml({
      effectiveUrl: "https://example.com/article",
      contentHtml: `
        <iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"></iframe>
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"></iframe>
        <iframe src="https://player.vimeo.com/video/1"></iframe>`,
    });
    expect(result.contentHtml).toContain('data-serial-embed="youtube"');
    expect(result.contentHtml).toContain('data-video-id="dQw4w9WgXcQ"');
    expect(result.contentHtml).toContain('data-start="42"');
    expect(result.contentHtml).not.toContain("iframe");
    expect(result.contentHtml).not.toContain("vimeo");
    expect(result.contentHtml).not.toContain("autoplay");
  });

  it("rejects stored HTML and DOMs beyond their limits", () => {
    expect(() =>
      sanitizeCaptureHtml({
        effectiveUrl: "https://example.com/article",
        contentHtml: `<p>${"x".repeat(2 * 1024 * 1024)}</p>`,
      }),
    ).toThrow("too large");

    expect(() =>
      sanitizeCaptureHtml({
        effectiveUrl: "https://example.com/article",
        contentHtml: `<p>${"<span>x</span>".repeat(50_001)}</p>`,
      }),
    ).toThrow("too many elements");
  });
});
