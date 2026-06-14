import { describe, expect, it } from "vitest";
import { getOgScreenshotDataUrl } from "~/server/og/screenshotDataUrls";

describe("getOgScreenshotDataUrl", () => {
  it("returns the matching release screenshot as a data URL", () => {
    expect(getOgScreenshotDataUrl("releases", "2026-06-14")).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("returns undefined when a guide screenshot does not exist", () => {
    expect(
      getOgScreenshotDataUrl("guides", "missing-guide-screenshot"),
    ).toBeUndefined();
  });
});
