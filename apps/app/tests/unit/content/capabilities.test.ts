import { describe, expect, it } from "vitest";
import {
  canRetainPageCapture,
  CONTENT_CAPABILITIES,
  getNativeOpeningBehavior,
  getOriginActionLabel,
} from "~/lib/content/capabilities";
import { CONTENT_PLATFORM, CONTENT_TYPE } from "~/lib/content/descriptor";

const EXPECTED = [
  ["website", "text", "reader", true, "Open in Website"],
  ["website", "video", "origin", false, "Open in Website"],
  ["youtube", "text", "origin", false, "View on YouTube"],
  ["youtube", "video", "player", false, "View on YouTube"],
  ["peertube", "text", "origin", false, "View on PeerTube"],
  ["peertube", "video", "player", false, "View on PeerTube"],
  ["nebula", "text", "origin", false, "View on Nebula"],
  ["nebula", "video", "origin", false, "View on Nebula"],
] as const;

describe("content capabilities", () => {
  it("exhaustively defines every platform and content-type combination", () => {
    expect(Object.keys(CONTENT_CAPABILITIES).sort()).toEqual(
      Object.values(CONTENT_PLATFORM).sort(),
    );
    for (const platform of Object.values(CONTENT_PLATFORM)) {
      expect(Object.keys(CONTENT_CAPABILITIES[platform]).sort()).toEqual(
        Object.values(CONTENT_TYPE).sort(),
      );
    }
  });

  it.each(EXPECTED)(
    "%s × %s opens through %s, capture allowed=%s, action=%s",
    (platform, contentType, opening, captureAllowed, originActionLabel) => {
      const descriptor = { platform, contentType };
      expect(getNativeOpeningBehavior(descriptor)).toBe(opening);
      expect(canRetainPageCapture(descriptor)).toBe(captureAllowed);
      expect(getOriginActionLabel(descriptor)).toBe(originActionLabel);
    },
  );
});
