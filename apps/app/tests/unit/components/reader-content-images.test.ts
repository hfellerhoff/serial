import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { flattenReaderImages } from "~/components/content-reader/flattenReaderImages";
import { ArticleImageLightbox } from "~/components/feed/read/ArticleImageLightbox";

function renderReaderNodes(...nodes: ReactNode[]) {
  return renderToStaticMarkup(
    createElement("main", null, ...flattenReaderImages(nodes)),
  );
}

describe("reader content images", () => {
  it("removes navigation wrapped around an image", () => {
    const markup = renderReaderNodes(
      createElement(
        "a",
        { href: "https://example.com/image-target" },
        "\n  ",
        createElement(
          "span",
          null,
          "\n",
          createElement(ArticleImageLightbox, {
            src: "https://example.com/image.jpg",
            alt: "Linked preview",
          }),
          "  ",
        ),
        "\n",
      ),
    );

    expect(markup).toContain('aria-label="Open image preview: Linked preview"');
    expect(markup).not.toContain("image-target");
  });

  it("preserves linked text next to a non-navigating image", () => {
    const markup = renderReaderNodes(
      createElement(
        "a",
        { href: "https://example.com/article" },
        createElement(ArticleImageLightbox, {
          src: "https://example.com/image.jpg",
          alt: "Mixed preview",
        }),
        "Read the article",
      ),
    );

    expect(markup.indexOf("Open image preview: Mixed preview")).toBeLessThan(
      markup.indexOf("Read the article"),
    );
    expect(markup).toContain(
      '<a href="https://example.com/article">Read the article</a>',
    );
  });

  it("leaves ordinary links unchanged", () => {
    const markup = renderReaderNodes(
      createElement(
        "a",
        { href: "https://example.com/article" },
        "Read the article",
      ),
    );

    expect(markup).toContain(
      '<a href="https://example.com/article">Read the article</a>',
    );
  });
});
