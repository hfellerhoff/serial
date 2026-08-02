import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import type * as FeedHttpModule from "~/server/rss/feedHttp";
import type { DatabaseFeed } from "~/server/db/schema";
import { fetchWebsiteFeedData } from "~/server/rss/parsers/website";

vi.mock("~/server/rss/feedHttp", async (importOriginal) => {
  const actual = await importOriginal<typeof FeedHttpModule>();
  return {
    ...actual,
    readFeedHttp: (url: string, options = {}) =>
      actual.readFeedHttp(url, options, {
        validateTarget: (value: string) => new URL(value),
        resolveAddresses: () =>
          Promise.resolve([{ address: "127.0.0.1", family: 4 }]),
      }),
  };
});

let server: Server;
let baseUrl: string;

let metadataRequestCount = 0;
let activeMetadataRequests = 0;
let maximumActiveMetadataRequests = 0;

function buildFeed(
  itemCount: number,
  firstItemContent: string,
  includeImages = true,
) {
  const items = Array.from({ length: itemCount }, (_, index) => {
    const content = index === 0 ? firstItemContent : `content-${index}`;
    const enclosure = includeImages
      ? `<enclosure url="${baseUrl}/image/${index}.jpg" type="image/jpeg" />`
      : "";
    return `<item>
      <guid>item-${index}</guid>
      <title>Item ${index}</title>
      <link>${baseUrl}/item/${index}</link>
      <pubDate>Fri, 31 Jul 2026 12:00:00 GMT</pubDate>
      <content:encoded><![CDATA[${content}]]></content:encoded>
      ${enclosure}
    </item>`;
  }).join("");

  return `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Bounded feed</title><link>${baseUrl}</link>${items}</channel></rss>`;
}

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/feed") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.end(buildFeed(205, "x".repeat(300_000)));
      return;
    }
    if (request.url === "/feed-no-images") {
      response.writeHead(200, { "Content-Type": "application/rss+xml" });
      response.end(buildFeed(20, "content", false));
      return;
    }
    if (request.url?.startsWith("/item/")) {
      metadataRequestCount++;
      activeMetadataRequests++;
      maximumActiveMetadataRequests = Math.max(
        maximumActiveMetadataRequests,
        activeMetadataRequests,
      );
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          `<meta property="og:image" content="${baseUrl}/fallback.jpg">`,
        );
        activeMetadataRequests--;
      }, 10);
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        baseUrl = `http://127.0.0.1:${address.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

function makeFeed(overrides: Partial<DatabaseFeed> = {}): DatabaseFeed {
  return {
    id: 1,
    userId: "user-1",
    name: "Bounded feed",
    url: `${baseUrl}/feed`,
    imageUrl: "",
    platform: "website",
    openLocation: "serial",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastFetchedAt: null,
    nextFetchAt: null,
    isActive: true,
    etag: null,
    lastModifiedHeader: null,
    ...overrides,
  };
}

describe("fetchWebsiteFeedData resource bounds", () => {
  it("retains at most 200 items and 256 KiB of item content", async () => {
    const result = await fetchWebsiteFeedData(makeFeed());
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("notModified");
    if (!result || "notModified" in result) return;

    expect(result.items).toHaveLength(200);
    expect(result.items[0]?.content).toHaveLength(256 * 1024);
  });

  it("fetches fallback metadata for at most 8 items with concurrency 2", async () => {
    metadataRequestCount = 0;
    activeMetadataRequests = 0;
    maximumActiveMetadataRequests = 0;

    const result = await fetchWebsiteFeedData(
      makeFeed({ url: `${baseUrl}/feed-no-images` }),
    );
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("notModified");
    if (!result || "notModified" in result) return;

    expect(metadataRequestCount).toBe(8);
    expect(maximumActiveMetadataRequests).toBeLessThanOrEqual(2);
    expect(result.items.filter((item) => item.thumbnail)).toHaveLength(8);
  });
});
