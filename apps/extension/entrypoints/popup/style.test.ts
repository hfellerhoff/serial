import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const popupStyles = readFileSync(
  new URL("./style.css", import.meta.url),
  "utf8",
);

describe("extension popup sizing", () => {
  it("grows from a square to one and a half times its width", () => {
    expect(popupStyles).toContain("width: 380px;");
    expect(popupStyles).toContain("min-height: 380px;");
    expect(popupStyles).toContain("max-height: 570px;");
    expect(popupStyles).not.toMatch(/^\s*height: 380px;/m);
  });

  it("keeps overflow inside the popup at its maximum height", () => {
    expect(popupStyles).toContain("overflow-y: auto;");
    expect(popupStyles).toContain("overflow-x: hidden;");
  });
});
