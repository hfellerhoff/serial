import { describe, expect, it } from "vitest";

import { isConnectedInstancePage } from "./background-bookmarks";

describe("extension Bookmark page eligibility", () => {
  it("treats every path on the connected Serial origin as the base extension", () => {
    expect(
      isConnectedInstancePage(
        "https://serial.example/read/bookmark?tab=later",
        "https://serial.example",
      ),
    ).toBe(true);
  });

  it("respects the connected origin port", () => {
    expect(
      isConnectedInstancePage(
        "http://localhost:3001/views",
        "http://localhost:3001",
      ),
    ).toBe(true);
    expect(
      isConnectedInstancePage(
        "http://localhost:3002/views",
        "http://localhost:3001",
      ),
    ).toBe(false);
  });
});
