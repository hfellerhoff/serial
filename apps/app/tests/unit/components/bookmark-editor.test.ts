import {
  BOOKMARK_ORIGIN_FALLBACK_MESSAGE,
  shouldShowBookmarkEditorFeedback,
} from "@serial/ui";
import { describe, expect, it } from "vitest";

describe("shouldShowBookmarkEditorFeedback", () => {
  const websiteText = { platform: "website", contentType: "text" } as const;

  it("uses the concise origin fallback copy", () => {
    expect(BOOKMARK_ORIGIN_FALLBACK_MESSAGE).toBe(
      "This bookmark will open in the original site.",
    );
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
