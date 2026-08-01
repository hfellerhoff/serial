import { describe, expect, it } from "vitest";
import {
  CONTENT_FILTER_OPTION,
  contentFilterAllowsDescriptor,
  contentFilterSchema,
  decodeContentFilter,
  encodeContentFilter,
  migrateLegacyViewContentType,
  toggleContentFilterOption,
} from "~/lib/views/contentFilter";

const OPTIONS = [
  CONTENT_FILTER_OPTION.TEXT,
  CONTENT_FILTER_OPTION.VIDEOS,
  CONTENT_FILTER_OPTION.SHORTS,
] as const;

describe("ContentFilter", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("round-trips valid bitmask %i", (value) => {
    const filter = contentFilterSchema.parse(value);
    expect(encodeContentFilter(decodeContentFilter(filter))).toBe(value);
  });

  it.each([0, -1, 8, 1.5, Number.NaN])("rejects invalid value %s", (value) => {
    expect(contentFilterSchema.safeParse(value).success).toBe(false);
  });

  it("projects text, horizontal/unknown video, and vertical video into named buckets", () => {
    for (const value of [1, 2, 3, 4, 5, 6, 7]) {
      const filter = contentFilterSchema.parse(value);
      const selected = decodeContentFilter(filter);
      expect(
        contentFilterAllowsDescriptor(filter, {
          contentType: "text",
          orientation: null,
        }),
      ).toBe(selected.includes("text"));
      expect(
        contentFilterAllowsDescriptor(filter, {
          contentType: "video",
          orientation: "horizontal",
        }),
      ).toBe(selected.includes("videos"));
      expect(
        contentFilterAllowsDescriptor(filter, {
          contentType: "video",
          orientation: null,
        }),
      ).toBe(selected.includes("videos"));
      expect(
        contentFilterAllowsDescriptor(filter, {
          contentType: "video",
          orientation: "vertical",
        }),
      ).toBe(selected.includes("shorts"));
    }
  });

  it("prevents toggling away the final selected option", () => {
    for (const [value, option] of [
      [1, "text"],
      [2, "videos"],
      [4, "shorts"],
    ] as const) {
      expect(() => toggleContentFilterOption(value, option)).toThrow();
    }
  });

  it("maps every legacy preset", () => {
    expect(migrateLegacyViewContentType("longform")).toBe(3);
    expect(migrateLegacyViewContentType("horizontal-video")).toBe(2);
    expect(migrateLegacyViewContentType("vertical-video")).toBe(4);
    expect(migrateLegacyViewContentType("all")).toBe(7);
    expect(OPTIONS).toHaveLength(3);
  });
});
