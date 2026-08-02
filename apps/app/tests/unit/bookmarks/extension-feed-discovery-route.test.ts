import { describe, expect, it, vi } from "vitest";

import { discoverExtensionBookmarkFeeds } from "~/app/api.extension.bookmark-feed-discovery";

vi.mock("~/server/db", () => ({
  db: { query: { user: { findFirst: vi.fn() } } },
}));
vi.mock("~/server/auth/extension", () => ({ findExtensionSession: vi.fn() }));

const TOKEN = `serial_ext_${"a".repeat(43)}`;

function discoveryRequest(sourceUrl = "https://example.com/article") {
  return new Request(
    "https://serial.example/api/extension/bookmark-feed-discovery",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sourceUrl }),
    },
  );
}

function dependencies() {
  return {
    authenticate: vi.fn(() => Promise.resolve({ id: "user-one" }) as never),
    discover: vi.fn(() =>
      Promise.resolve(
        [] as Array<{ url: string; title?: string; format?: string }>,
      ),
    ),
  };
}

describe("extension Bookmark Feed-discovery HTTP contract", () => {
  it("authenticates and returns bounded discovered Feeds", async () => {
    const deps = dependencies();
    deps.discover.mockResolvedValue([
      {
        url: "https://example.com/feed.xml",
        title: "Example Feed",
        format: "rss",
      },
    ]);

    const response = await discoverExtensionBookmarkFeeds(
      discoveryRequest(),
      deps,
    );

    expect(response.status).toBe(200);
    expect(deps.discover).toHaveBeenCalledWith(
      "user-one",
      "https://example.com/article",
    );
    await expect(response.json()).resolves.toEqual({
      feeds: [{ url: "https://example.com/feed.xml", title: "Example Feed" }],
    });
  });

  it("keeps an empty discovery result distinct from request failure", async () => {
    const response = await discoverExtensionBookmarkFeeds(
      discoveryRequest(),
      dependencies(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ feeds: [] });
  });

  it("reports discovery failure without changing the saved Bookmark contract", async () => {
    const deps = dependencies();
    deps.discover.mockRejectedValue(new Error("upstream unavailable"));

    const response = await discoverExtensionBookmarkFeeds(
      discoveryRequest(),
      deps,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to discover Feeds",
    });
  });

  it("rejects non-HTTP(S) and credential-bearing targets", async () => {
    for (const sourceUrl of [
      "file:///tmp/article",
      "https://user:secret@example.com/article",
    ]) {
      const deps = dependencies();
      const response = await discoverExtensionBookmarkFeeds(
        discoveryRequest(sourceUrl),
        deps,
      );

      expect(response.status).toBe(400);
      expect(deps.discover).not.toHaveBeenCalled();
    }
  });

  it("requires extension authentication", async () => {
    const deps = dependencies();
    deps.authenticate.mockResolvedValue(null as never);

    const response = await discoverExtensionBookmarkFeeds(
      discoveryRequest(),
      deps,
    );

    expect(response.status).toBe(401);
    expect(deps.discover).not.toHaveBeenCalled();
  });
});
