import {
  BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
  BookmarkEditor,
  getBookmarkEditorFeedbackPresentation,
  shouldShowBookmarkEditorFeedback,
} from "@serial/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("shouldShowBookmarkEditorFeedback", () => {
  const websiteText = { platform: "website", contentType: "text" } as const;

  it("uses the concise origin fallback copy", () => {
    expect(BOOKMARK_ORIGIN_FALLBACK_MESSAGE).toBe(
      "This bookmark will open in the original site.",
    );
  });

  it("maps compact status tooltips to the established icons", () => {
    expect(
      getBookmarkEditorFeedbackPresentation({
        capture: { status: "captured" },
        disposition: "refreshed",
      }),
    ).toEqual({
      icon: "refresh",
      message:
        "Existing Bookmark refreshed. Its Views and Tags were preserved.",
    });
    expect(
      getBookmarkEditorFeedbackPresentation({
        capture: { status: "unavailable", reason: "unsupported_content" },
        disposition: "created",
      }),
    ).toEqual({
      icon: "origin",
      message: BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
    });
    expect(
      getBookmarkEditorFeedbackPresentation({
        capture: { status: "preserved", reason: "timeout" },
        disposition: "refreshed",
      }),
    ).toEqual({
      icon: "info",
      message:
        "The page took too long to capture. The previous Page capture is still available.",
    });
  });

  it("renders status as a header icon instead of a visible paragraph", () => {
    const message =
      "Existing Bookmark refreshed. Its Views and Tags were preserved.";
    const markup = renderToStaticMarkup(
      createElement(BookmarkEditor, {
        bookmark: {
          title: "Article",
          author: "Author",
          sourceUrl: "https://example.com/article",
          platform: "website",
          contentType: "text",
        },
        feedback: {
          capture: { status: "captured" },
          disposition: "refreshed",
        },
        viewOptions: [],
        selectedViewIds: [],
        onToggleView: () => undefined,
        onCreateView: () => undefined,
        tagOptions: [],
        selectedTagIds: [],
        onToggleTag: () => undefined,
        onCreateTag: () => undefined,
        isDeleting: false,
        onDelete: () => undefined,
        onDone: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="bookmark-capture-feedback"');
    expect(markup).toContain("lucide-refresh-cw");
    expect(markup).toContain(`aria-label="${message}"`);
    expect(markup).not.toContain('role="status"');
    expect(markup).toContain('data-slot="bookmark-editor"');
    expect(markup).toContain("min-w-0");
    expect(markup).not.toContain("overflow-y-auto");
    expect(markup).not.toContain("max-h-");
    expect(markup.match(/px-6/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps long organization labels within the editor container", () => {
    const longLabel = "A View name that is much wider than its parent surface";
    const markup = renderToStaticMarkup(
      createElement(BookmarkEditor, {
        bookmark: {
          title:
            "A Bookmark title that is also much wider than its parent surface",
          author: "An equally long Bookmark author name",
          sourceUrl: "https://example.com/article",
          platform: "website",
          contentType: "text",
        },
        viewOptions: [{ id: 1, label: longLabel }],
        selectedViewIds: [],
        onToggleView: () => undefined,
        onCreateView: () => undefined,
        tagOptions: [{ id: 2, label: longLabel }],
        selectedTagIds: [],
        onToggleTag: () => undefined,
        onCreateTag: () => undefined,
        isDeleting: false,
        onDelete: () => undefined,
        onDone: () => undefined,
      }),
    );

    expect(markup.match(/max-w-full/g)).toHaveLength(2);
    expect(markup.match(/class="truncate"/g)).toHaveLength(2);
    expect(markup.match(/min-w-0/g)?.length).toBeGreaterThanOrEqual(6);
  });

  it("hides routine first-save outcomes", () => {
    expect(
      shouldShowBookmarkEditorFeedback(
        {
          capture: { status: "captured" },
          disposition: "created",
        },
        websiteText,
      ),
    ).toBe(false);
  });

  it("shows unsupported origin-only content with any disposition", () => {
    expect(
      shouldShowBookmarkEditorFeedback(
        {
          capture: { status: "unavailable", reason: "unsupported_content" },
          disposition: "created",
        },
        websiteText,
      ),
    ).toBe(true);
  });

  it("hides expected missing captures for native players", () => {
    for (const platform of ["youtube", "peertube"] as const) {
      expect(
        shouldShowBookmarkEditorFeedback(
          {
            capture: {
              status: "unavailable",
              reason: "unsupported_content",
            },
            disposition: "consolidated",
          },
          { platform, contentType: "video" },
        ),
      ).toBe(false);
    }
  });

  it("shows rebookmark and capture-error outcomes", () => {
    expect(
      shouldShowBookmarkEditorFeedback(
        {
          capture: { status: "captured" },
          disposition: "refreshed",
        },
        websiteText,
      ),
    ).toBe(true);
    expect(
      shouldShowBookmarkEditorFeedback(
        {
          capture: { status: "unavailable", reason: "unsupported_content" },
          disposition: "consolidated",
        },
        websiteText,
      ),
    ).toBe(true);
    expect(
      shouldShowBookmarkEditorFeedback(
        {
          capture: { status: "unavailable", reason: "timeout" },
          disposition: "created",
        },
        websiteText,
      ),
    ).toBe(true);
  });
});
