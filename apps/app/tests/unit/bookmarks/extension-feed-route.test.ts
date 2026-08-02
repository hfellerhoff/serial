import { beforeEach, describe, expect, it, vi } from "vitest";
import { addExtensionFeed } from "~/app/api.extension.feeds";
import { authenticatedExtensionUser } from "~/server/auth/extensionRequest";
import { createFeedsForUser } from "~/server/feeds/create";

vi.mock("~/server/auth/extensionRequest", () => ({
  authenticatedExtensionUser: vi.fn(),
}));
vi.mock("~/server/feeds/create", () => ({ createFeedsForUser: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

function request(body: unknown, contentType = "application/json") {
  return new Request("https://serial.example/api/extension/feeds", {
    method: "POST",
    headers: {
      Authorization: "Bearer serial_ext_test",
      "Content-Type": contentType,
    },
    body: JSON.stringify(body),
  });
}

describe("extension Feed HTTP contract", () => {
  beforeEach(() => {
    vi.mocked(authenticatedExtensionUser).mockReset();
    vi.mocked(createFeedsForUser).mockReset();
  });

  it("requires a valid extension session", async () => {
    vi.mocked(authenticatedExtensionUser).mockResolvedValue(null);
    const response = await addExtensionFeed(
      request({ url: "https://example.com/feed.xml" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("adds a discovered Feed for the authenticated user", async () => {
    vi.mocked(authenticatedExtensionUser).mockResolvedValue({
      id: "user-one",
    } as never);
    vi.mocked(createFeedsForUser).mockResolvedValue({
      feeds: [{ id: 1 }],
      deactivatedCount: 0,
      maxActiveFeeds: 100,
    } as never);
    const response = await addExtensionFeed(
      request({ url: "https://example.com/feed.xml" }),
    );

    expect(response.status).toBe(201);
    expect(createFeedsForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-one",
        url: "https://example.com/feed.xml",
        categoryIds: [],
        viewIds: [],
      }),
    );
  });

  it("rejects malformed and non-JSON requests", async () => {
    vi.mocked(authenticatedExtensionUser).mockResolvedValue({
      id: "user-one",
    } as never);
    expect((await addExtensionFeed(request({ url: "nope" }))).status).toBe(400);
    expect((await addExtensionFeed(request({}, "text/plain"))).status).toBe(
      415,
    );
  });

  it("rejects encoded and oversized requests before feed creation", async () => {
    vi.mocked(authenticatedExtensionUser).mockResolvedValue({
      id: "user-one",
    } as never);
    const encoded = request({ url: "https://example.com/feed.xml" });
    encoded.headers.set("Content-Encoding", "gzip");
    expect((await addExtensionFeed(encoded)).status).toBe(415);

    const oversized = request({ url: "https://example.com/feed.xml" });
    oversized.headers.set("Content-Length", String(16 * 1024 + 1));
    expect((await addExtensionFeed(oversized)).status).toBe(413);
    expect(createFeedsForUser).not.toHaveBeenCalled();
  });
});
