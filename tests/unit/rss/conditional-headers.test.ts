import { describe, expect, it } from "vitest";
import { buildConditionalHeaders } from "~/server/rss/calculateNextFetch";

describe("buildConditionalHeaders", () => {
  it("returns If-None-Match when etag is provided", () => {
    const headers = buildConditionalHeaders({
      etag: '"abc123"',
      lastModifiedHeader: null,
    });
    expect(headers).toEqual({ "If-None-Match": '"abc123"' });
  });

  it("returns If-Modified-Since when lastModifiedHeader is provided", () => {
    const headers = buildConditionalHeaders({
      etag: null,
      lastModifiedHeader: "Wed, 21 Oct 2024 07:28:00 GMT",
    });
    expect(headers).toEqual({
      "If-Modified-Since": "Wed, 21 Oct 2024 07:28:00 GMT",
    });
  });

  it("returns both headers when both are provided", () => {
    const headers = buildConditionalHeaders({
      etag: '"abc123"',
      lastModifiedHeader: "Wed, 21 Oct 2024 07:28:00 GMT",
    });
    expect(headers).toEqual({
      "If-None-Match": '"abc123"',
      "If-Modified-Since": "Wed, 21 Oct 2024 07:28:00 GMT",
    });
  });

  it("returns empty object when both are null", () => {
    const headers = buildConditionalHeaders({
      etag: null,
      lastModifiedHeader: null,
    });
    expect(headers).toEqual({});
  });

  it("returns empty object when both are undefined", () => {
    const headers = buildConditionalHeaders({});
    expect(headers).toEqual({});
  });
});
