import { describe, expect, it } from "vitest";
import { shouldAdvanceAfterToggleRead } from "~/lib/hooks/readAdvance";

describe("read navigation advance", () => {
  it("advances in global Unread", () => {
    expect(
      shouldAdvanceAfterToggleRead({
        visibilityFilter: "unread",
        savedSectionVisibility: null,
      }),
    ).toBe(true);
  });

  it("advances in a Saved section showing Unread", () => {
    expect(
      shouldAdvanceAfterToggleRead({
        visibilityFilter: "later",
        savedSectionVisibility: "unread",
      }),
    ).toBe(true);
  });

  it("stays selected in a Saved section showing All", () => {
    expect(
      shouldAdvanceAfterToggleRead({
        visibilityFilter: "later",
        savedSectionVisibility: "all",
      }),
    ).toBe(false);
  });
});
