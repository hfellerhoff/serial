import { describe, expect, it } from "vitest";
import {
  canOpenContent,
  canOpenOfflineContent,
} from "~/lib/data/offline-content";
import { canMutate } from "~/lib/data/offline-mutations";

describe("offline content capability", () => {
  it("opens normal destinations until disconnection is established", () => {
    expect(
      canOpenContent({
        connectionState: "unknown",
        contentType: "video",
        hasBody: false,
      }),
    ).toBe(true);
    expect(
      canOpenContent({
        connectionState: "connected",
        contentType: "text",
        hasBody: false,
      }),
    ).toBe(true);
  });

  it("opens only retained text while disconnected", () => {
    expect(canOpenOfflineContent({ contentType: "text", hasBody: true })).toBe(
      true,
    );
    expect(
      canOpenContent({
        connectionState: "disconnected",
        contentType: "text",
        hasBody: false,
      }),
    ).toBe(false);
    expect(
      canOpenContent({
        connectionState: "disconnected",
        contentType: "video",
        hasBody: true,
      }),
    ).toBe(false);
  });
});

describe("offline mutation gate", () => {
  it("blocks mutations only after disconnection is established", () => {
    expect(canMutate("unknown")).toBe(true);
    expect(canMutate("connected")).toBe(true);
    expect(canMutate("disconnected")).toBe(false);
  });
});
