import { describe, expect, it, vi } from "vitest";
import { discoverFeeds as discoverFeedsFromUrl } from "feedscout";

import type { saveBookmarkFromExtension } from "~/server/bookmarks/service";
import {
  mutateExtensionBookmark,
  preflightResponse,
  removeExtensionBookmark,
  saveExtensionBookmark,
} from "~/app/api.extension.bookmarks";

vi.mock("~/server/db", () => ({
  db: { query: { user: { findFirst: vi.fn() } } },
}));
vi.mock("~/server/auth/extension", () => ({ findExtensionSession: vi.fn() }));
vi.mock("~/server/bookmarks/service", () => ({
  deleteBookmark: vi.fn(),
  saveBookmarkFromExtension: vi.fn(),
  setBookmarkTag: vi.fn(),
  setBookmarkView: vi.fn(),
}));
vi.mock("feedscout", () => ({ discoverFeeds: vi.fn() }));

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

function bookmarkMutation(method: "PATCH" | "DELETE", body: unknown) {
  return new Request("https://serial.example/api/extension/bookmarks", {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
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
    feeds: [{ url: "https://example.com/declared.xml" }],
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

  it("forwards client preflight failure reasons and returns editor workspace data", async () => {
    const deps = {
      ...dependencies(successfulResult("created")),
      workspace: vi.fn(
        () =>
          Promise.resolve({
            bookmark: {
              id: "bookmark-one",
              title: "Article",
              viewIds: [1],
              tagIds: [2],
            },
            views: [{ id: 1, name: "Reading" }],
            tags: [{ id: 2, name: "Research" }],
          }) as never,
      ),
    };
    const response = await saveExtensionBookmark(
      bookmarkRequest(
        supportedRequest({
          captureFailureReason: "too_large",
        }),
      ),
      deps,
    );

    expect(deps.save).toHaveBeenCalledWith(
      expect.objectContaining({ captureFailureReason: "too_large" }),
    );
    await expect(response.json()).resolves.toMatchObject({
      bookmark: { id: "bookmark-one", viewIds: [1], tagIds: [2] },
      workspace: {
        views: [{ id: 1, name: "Reading" }],
        tags: [{ id: 2, name: "Research" }],
      },
    });
  });

  it("uses Serial Feed discovery when the page declares no Feeds", async () => {
    vi.mocked(discoverFeedsFromUrl).mockResolvedValue([
      {
        url: "https://example.com/discovered.xml",
        title: "Discovered Feed",
        isValid: true,
      },
    ] as never);

    const response = await saveExtensionBookmark(
      bookmarkRequest(supportedRequest({ feeds: [] })),
      dependencies(),
    );

    expect(discoverFeedsFromUrl).toHaveBeenCalledWith(
      "https://example.com/article",
      { methods: ["platform", "html", "headers", "guess"] },
    );
    await expect(response.json()).resolves.toMatchObject({
      feeds: [
        {
          url: "https://example.com/discovered.xml",
          title: "Discovered Feed",
        },
      ],
    });
  });

  it("prefers page-declared Feeds without running server discovery", async () => {
    vi.mocked(discoverFeedsFromUrl).mockClear();
    const declaredFeeds = [
      {
        url: "https://example.com/declared.xml",
        title: "Declared Feed",
      },
    ];

    const response = await saveExtensionBookmark(
      bookmarkRequest(supportedRequest({ feeds: declaredFeeds })),
      dependencies(),
    );

    expect(response.status).toBe(201);
    expect(discoverFeedsFromUrl).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      feeds: declaredFeeds,
    });
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

  it("persists View organization and publishes the updated Bookmark", async () => {
    const deps = {
      authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
      setView: vi.fn(() => Promise.resolve()),
      setTag: vi.fn(() => Promise.resolve()),
      createView: vi.fn(),
      createTag: vi.fn(),
      publish: vi.fn(() => Promise.resolve({ id: "bookmark-one" }) as never),
    };
    const response = await mutateExtensionBookmark(
      bookmarkMutation("PATCH", {
        action: "set-view",
        bookmarkId: "bookmark-one",
        viewId: 12,
        assigned: true,
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.setView).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-one",
        bookmarkId: "bookmark-one",
        viewId: 12,
        assigned: true,
      }),
    );
    expect(deps.publish).toHaveBeenCalled();
    expect(deps.setTag).not.toHaveBeenCalled();
  });

  it("creates and assigns a View through the extension editor", async () => {
    const deps = {
      authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
      setView: vi.fn(() => Promise.resolve()),
      setTag: vi.fn(() => Promise.resolve()),
      createView: vi.fn(
        () => Promise.resolve({ id: 14, name: "Essays", tagIds: [] }) as never,
      ),
      createTag: vi.fn(),
      publish: vi.fn(
        () =>
          Promise.resolve({
            id: "bookmark-one",
            viewIds: [14],
            tagIds: [],
          }) as never,
      ),
    };
    const response = await mutateExtensionBookmark(
      bookmarkMutation("PATCH", {
        action: "create-view",
        bookmarkId: "bookmark-one",
        name: "Essays",
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.createView).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-one",
        bookmarkId: "bookmark-one",
        name: "Essays",
      }),
    );
    expect(deps.setView).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "bookmark-one",
        viewId: 14,
        assigned: true,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      createdOption: {
        kind: "view",
        option: { id: 14, name: "Essays", tagIds: [] },
      },
    });
  });

  it("creates and assigns a Tag through the extension editor", async () => {
    const deps = {
      authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
      setView: vi.fn(() => Promise.resolve()),
      setTag: vi.fn(() => Promise.resolve()),
      createView: vi.fn(),
      createTag: vi.fn(
        () => Promise.resolve({ id: 21, name: "Research" }) as never,
      ),
      publish: vi.fn(
        () =>
          Promise.resolve({
            id: "bookmark-one",
            viewIds: [],
            tagIds: [21],
          }) as never,
      ),
    };
    const response = await mutateExtensionBookmark(
      bookmarkMutation("PATCH", {
        action: "create-tag",
        bookmarkId: "bookmark-one",
        name: "Research",
      }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-one",
        bookmarkId: "bookmark-one",
        name: "Research",
      }),
    );
    expect(deps.setTag).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmarkId: "bookmark-one",
        tagId: 21,
        assigned: true,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      createdOption: {
        kind: "tag",
        option: { id: 21, name: "Research" },
      },
    });
  });

  it("removes the Bookmark and publishes its deletion", async () => {
    const deps = {
      authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
      remove: vi.fn(
        () =>
          Promise.resolve({
            id: "bookmark-one",
            canonicalUrl: "https://example.com/article",
          }) as never,
      ),
      publish: vi.fn(() => Promise.resolve()),
    };
    const response = await removeExtensionBookmark(
      bookmarkMutation("DELETE", { bookmarkId: "bookmark-one" }),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-one",
        bookmarkId: "bookmark-one",
      }),
    );
    expect(deps.publish).toHaveBeenCalledWith({
      userId: "user-one",
      id: "bookmark-one",
      canonicalUrl: "https://example.com/article",
    });
  });

  it("applies the request ceiling to organization and removal", async () => {
    const mutationDependencies = {
      authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
      setView: vi.fn(),
      setTag: vi.fn(),
      createView: vi.fn(),
      createTag: vi.fn(),
      publish: vi.fn(),
    };
    const mutation = bookmarkMutation("PATCH", {
      action: "set-view",
      bookmarkId: "bookmark-one",
      viewId: 1,
      assigned: true,
    });
    mutation.headers.set("Content-Length", String(4 * 1024 * 1024 + 1));
    expect(
      (await mutateExtensionBookmark(mutation, mutationDependencies)).status,
    ).toBe(413);

    const removalDependencies = {
      authenticate: mutationDependencies.authenticate,
      remove: vi.fn(),
      publish: vi.fn(),
    };
    const removal = bookmarkMutation("DELETE", {
      bookmarkId: "bookmark-one",
    });
    removal.headers.set("Content-Length", String(4 * 1024 * 1024 + 1));
    expect(
      (await removeExtensionBookmark(removal, removalDependencies)).status,
    ).toBe(413);
    expect(mutationDependencies.setView).not.toHaveBeenCalled();
    expect(removalDependencies.remove).not.toHaveBeenCalled();
  });
});
