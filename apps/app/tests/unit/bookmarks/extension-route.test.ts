import { describe, expect, it, vi } from "vitest";

import type { saveBookmarkFromExtension } from "~/server/bookmarks/service";
import {
  preflightResponse,
  saveExtensionBookmark,
} from "~/app/api.extension.bookmarks";

vi.mock("~/server/db", () => ({
  db: { query: { user: { findFirst: vi.fn() } } },
}));
vi.mock("~/server/auth/extension", () => ({ findExtensionSession: vi.fn() }));
vi.mock("~/server/bookmarks/service", () => ({
  saveBookmarkFromExtension: vi.fn(),
}));

const TOKEN = `serial_ext_${"a".repeat(43)}`;

function bookmarkRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://serial.example/api/extension/bookmarks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function supportedRequest(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: 2,
    sourceUrl: "https://example.com/article",
    capture: {
      effectiveUrl: "https://example.com/article",
      title: "Article",
      descriptor: {
        platform: "website",
        contentType: "text",
        orientation: null,
        contentId: null,
        classifierVersion: 1,
      },
    },
    ...overrides,
  };
}

function successfulResult(disposition: "created" | "refreshed") {
  return {
    disposition,
    bookmark: { id: "bookmark-one" },
    capture: { status: "unavailable", reason: "unextractable" },
  } as unknown as Awaited<ReturnType<typeof saveBookmarkFromExtension>>;
}

function dependencies(
  result: Awaited<
    ReturnType<typeof saveBookmarkFromExtension>
  > = successfulResult("created"),
) {
  return {
    authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
    save: vi.fn(() => Promise.resolve(result)),
  };
}

describe("extension Bookmark HTTP contract", () => {
  it("returns credential-free CORS preflight headers", () => {
    const response = preflightResponse();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Authorization, Content-Type",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("requires extension authentication and never caches failures", async () => {
    const response = await saveExtensionBookmark(
      bookmarkRequest(supportedRequest()),
      {
        authenticate: vi.fn(() => Promise.resolve(null)),
        save: vi.fn(),
      },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects content encodings and non-JSON requests", async () => {
    const deps = dependencies();
    const encoded = await saveExtensionBookmark(
      bookmarkRequest({}, { "Content-Encoding": "gzip" }),
      deps,
    );
    expect(encoded.status).toBe(415);

    const plainText = new Request(
      "https://serial.example/api/extension/bookmarks",
      { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" },
    );
    expect((await saveExtensionBookmark(plainText, deps)).status).toBe(415);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("enforces the request byte ceiling", async () => {
    const request = bookmarkRequest(supportedRequest(), {
      "Content-Length": String(4 * 1024 * 1024 + 1),
    });
    const response = await saveExtensionBookmark(request, dependencies());
    expect(response.status).toBe(413);
  });

  it("uses 201 for creation and 200 for refresh", async () => {
    const requestBody = supportedRequest();
    expect(
      (
        await saveExtensionBookmark(
          bookmarkRequest(requestBody),
          dependencies(successfulResult("created")),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await saveExtensionBookmark(
          bookmarkRequest(requestBody),
          dependencies(successfulResult("refreshed")),
        )
      ).status,
    ).toBe(200);
  });

  it("rejects malformed capture data rather than accepting another shape", async () => {
    const deps = dependencies();
    const response = await saveExtensionBookmark(
      bookmarkRequest({
        contractVersion: 2,
        sourceUrl: "https://example.com/article",
        capture: { title: "missing required capture fields" },
      }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.save).not.toHaveBeenCalled();
  });

  it("rejects unsupported contract versions without a legacy parser", async () => {
    const deps = dependencies();
    const response = await saveExtensionBookmark(
      bookmarkRequest({
        contractVersion: 99,
        sourceUrl: "https://example.com/article",
        capture: { private: "ignored" },
      }),
      deps,
    );
    expect(response.status).toBe(400);
    expect(deps.save).not.toHaveBeenCalled();
  });
});
