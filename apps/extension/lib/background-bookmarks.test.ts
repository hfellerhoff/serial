import { describe, expect, it, vi } from "vitest";
import { EXTENSION_FEED_ADD_REQUEST_TIMEOUT_MS } from "@serial/bookmark-capture";

import {
  handleBookmarkMessage,
  isConnectedInstancePage,
  parseWorkspace,
} from "./background-bookmarks";

function workspacePayload(feeds?: unknown) {
  return {
    disposition: "created",
    capture: { status: "captured" },
    bookmark: {
      id: "bookmark-one",
      sourceUrl: "https://example.com/article",
      platform: "website",
      contentType: "text",
      title: "Article",
      viewIds: [],
      tagIds: [],
    },
    workspace: { views: [], tags: [] },
    ...(feeds === undefined ? {} : { feeds }),
  };
}

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

describe("extension Bookmark Feed discovery", () => {
  it("uses server discovery results when the response provides them", () => {
    const serverFeeds = [
      { url: "https://example.com/server.xml", title: "Server Feed" },
    ];
    const workspace = parseWorkspace(workspacePayload(serverFeeds), [
      { url: "https://example.com/local.xml", title: "Local Feed" },
    ]);

    expect(workspace?.feeds).toEqual(serverFeeds);
  });

  it("uses the complete bounded Feed-add timeout without changing ordinary requests", async () => {
    const fetchFromInstance = vi.fn(() =>
      Promise.resolve(Response.json({}, { status: 201 })),
    );

    await handleBookmarkMessage(
      { type: "bookmark.add-feed", url: "https://example.com/feed.xml" },
      {
        readStoredSession: vi.fn(() =>
          Promise.resolve({
            version: 1,
            instance: "https://serial.example",
            token: "serial_ext_test",
            expiresAt: Date.now() + 60_000,
            user: { id: "user-one", name: "User", email: "u@example.com" },
          } as never),
        ),
        clearSession: vi.fn(),
        fetchFromInstance,
      },
    );

    expect(fetchFromInstance).toHaveBeenCalledWith(
      "https://serial.example/api/extension/feeds",
      expect.objectContaining({ method: "POST" }),
      { timeoutMs: EXTENSION_FEED_ADD_REQUEST_TIMEOUT_MS },
    );
  });

  it("retains page-declared Feeds for an older compatible response", () => {
    const localFeeds = [
      { url: "https://example.com/local.xml", title: "Local Feed" },
    ];

    expect(parseWorkspace(workspacePayload(), localFeeds)?.feeds).toEqual(
      localFeeds,
    );
  });

  it("rejects an unknown capture failure reason", () => {
    expect(
      parseWorkspace(
        {
          ...workspacePayload(),
          capture: { status: "unavailable", reason: "future_reason" },
        },
        [],
      ),
    ).toBeNull();
  });
});
