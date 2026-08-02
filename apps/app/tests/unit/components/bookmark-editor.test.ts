import { shouldShowBookmarkEditorFeedback } from "@serial/ui";
import { describe, expect, it } from "vitest";

describe("shouldShowBookmarkEditorFeedback", () => {
  it("hides routine first-save outcomes", () => {
    expect(
      shouldShowBookmarkEditorFeedback({
        capture: { status: "captured" },
        disposition: "created",
      }),
    ).toBe(false);
    expect(
      shouldShowBookmarkEditorFeedback({
        capture: { status: "unavailable", reason: "unsupported_content" },
        disposition: "created",
      }),
    ).toBe(false);
  });

  it("shows rebookmark and capture-error outcomes", () => {
    expect(
      shouldShowBookmarkEditorFeedback({
        capture: { status: "captured" },
        disposition: "refreshed",
      }),
    ).toBe(true);
    expect(
      shouldShowBookmarkEditorFeedback({
        capture: { status: "unavailable", reason: "unsupported_content" },
        disposition: "consolidated",
      }),
    ).toBe(true);
    expect(
      shouldShowBookmarkEditorFeedback({
        capture: { status: "unavailable", reason: "timeout" },
        disposition: "created",
      }),
    ).toBe(true);
  });
});
