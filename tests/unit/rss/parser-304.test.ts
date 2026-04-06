import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import type { DatabaseFeed } from "~/server/db/schema";
import type {
  NotModifiedResult,
  RSSFeedWithMetadata,
} from "~/server/rss/types";
import { fetchYouTubeFeedData } from "~/server/rss/parsers/youtube";

const FIRESHIP_OLD_XML = readFileSync(
  resolvePath(__dirname, "../../e2e/fixtures/fireship-old.xml"),
  "utf-8",
);
const FIRESHIP_XML = readFileSync(
  resolvePath(__dirname, "../../e2e/fixtures/fireship.xml"),
  "utf-8",
);

const ETAG_V1 = '"fireship-v1"';
const ETAG_V2 = '"fireship-v2"';
const LAST_MODIFIED_V1 = "Sat, 05 Apr 2026 18:00:00 GMT";
const LAST_MODIFIED_V2 = "Sun, 06 Apr 2026 18:00:00 GMT";

/** Mutable server state — tests can switch between old/new content. */
let currentContent = FIRESHIP_OLD_XML;
let currentEtag = ETAG_V1;
let currentLastModified = LAST_MODIFIED_V1;

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];

    // Return 304 if conditional headers match current version
    if (
      ifNoneMatch === currentEtag ||
      ifModifiedSince === currentLastModified
    ) {
      res.writeHead(304, {
        ETag: currentEtag,
        "Last-Modified": currentLastModified,
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "application/atom+xml",
      ETag: currentEtag,
      "Last-Modified": currentLastModified,
    });
    res.end(currentContent);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

function makeFeed(overrides?: Partial<DatabaseFeed>): DatabaseFeed {
  return {
    id: 1,
    userId: "user-1",
    name: "Fireship",
    url: `${baseUrl}/feed`,
    imageUrl: "",
    platform: "youtube",
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

function setServerContent(version: "v1" | "v2") {
  if (version === "v1") {
    currentContent = FIRESHIP_OLD_XML;
    currentEtag = ETAG_V1;
    currentLastModified = LAST_MODIFIED_V1;
  } else {
    currentContent = FIRESHIP_XML;
    currentEtag = ETAG_V2;
    currentLastModified = LAST_MODIFIED_V2;
  }
}

describe("YouTube parser with real RSS server", () => {
  it("parses feed items on first fetch (no cached headers)", async () => {
    setServerContent("v1");
    const feed = makeFeed();
    const result = await fetchYouTubeFeedData(feed);

    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty("notModified");

    const data = result as RSSFeedWithMetadata;
    expect(data.title).toBe("Fireship");
    expect(data.items).toHaveLength(14);
    expect(data.fetchMetadata.etag).toBe(ETAG_V1);
    expect(data.fetchMetadata.lastModified).toBe(LAST_MODIFIED_V1);
  });

  it("returns notModified on second fetch with cached ETag", async () => {
    setServerContent("v1");
    const result = await fetchYouTubeFeedData(makeFeed({ etag: ETAG_V1 }), {
      etag: ETAG_V1,
      lastModifiedHeader: null,
    });

    expect(result).toHaveProperty("notModified", true);
  });

  it("returns notModified on second fetch with cached Last-Modified", async () => {
    setServerContent("v1");
    const result = await fetchYouTubeFeedData(
      makeFeed({ lastModifiedHeader: LAST_MODIFIED_V1 }),
      { etag: null, lastModifiedHeader: LAST_MODIFIED_V1 },
    );

    expect(result).toHaveProperty("notModified", true);
  });

  it("returns full data when ETag does not match", async () => {
    setServerContent("v1");
    const result = await fetchYouTubeFeedData(
      makeFeed({ etag: '"stale-etag"' }),
      { etag: '"stale-etag"', lastModifiedHeader: null },
    );

    expect(result).not.toHaveProperty("notModified");
    expect((result as RSSFeedWithMetadata).items).toHaveLength(14);
  });

  it("full cache lifecycle: fetch → cache → 304 skip", async () => {
    setServerContent("v1");
    const feed = makeFeed();

    // First fetch
    const first = (await fetchYouTubeFeedData(feed)) as RSSFeedWithMetadata;
    expect(first.items).toHaveLength(14);
    expect(first.fetchMetadata.etag).toBe(ETAG_V1);

    // Second fetch with cached headers → 304
    const second = await fetchYouTubeFeedData(feed, {
      etag: first.fetchMetadata.etag,
      lastModifiedHeader: first.fetchMetadata.lastModified,
    });
    expect(second).toHaveProperty("notModified", true);
  });
});

describe("YouTube parser with feed content update", () => {
  it("detects new content when server updates (ETag changes)", async () => {
    // Start with old content
    setServerContent("v1");
    const feed = makeFeed();

    const first = (await fetchYouTubeFeedData(feed)) as RSSFeedWithMetadata;
    expect(first.items).toHaveLength(14);
    const cachedEtag = first.fetchMetadata.etag;

    // Verify cache works
    const cached = await fetchYouTubeFeedData(feed, {
      etag: cachedEtag,
      lastModifiedHeader: null,
    });
    expect(cached).toHaveProperty("notModified", true);

    // Server publishes new video → content and ETag change
    setServerContent("v2");

    // Client sends the old ETag — server returns 200 with new content
    const updated = await fetchYouTubeFeedData(feed, {
      etag: cachedEtag,
      lastModifiedHeader: null,
    });

    expect(updated).not.toHaveProperty("notModified");
    const data = updated as RSSFeedWithMetadata;
    expect(data.items).toHaveLength(15);
    expect(data.items[0]!.title).toBe(
      "Cursor ditches VS Code, but not everyone is happy...",
    );
    expect(data.fetchMetadata.etag).toBe(ETAG_V2);
  });

  it("detects new content when server updates (Last-Modified changes)", async () => {
    setServerContent("v1");
    const feed = makeFeed();

    const first = (await fetchYouTubeFeedData(feed)) as RSSFeedWithMetadata;
    expect(first.items).toHaveLength(14);
    const cachedLastModified = first.fetchMetadata.lastModified;

    // Server publishes new video
    setServerContent("v2");

    // Client sends old Last-Modified → server returns 200
    const updated = await fetchYouTubeFeedData(feed, {
      etag: null,
      lastModifiedHeader: cachedLastModified,
    });

    expect(updated).not.toHaveProperty("notModified");
    const data = updated as RSSFeedWithMetadata;
    expect(data.items).toHaveLength(15);
    expect(data.fetchMetadata.lastModified).toBe(LAST_MODIFIED_V2);
  });

  it("caches again after fetching updated content", async () => {
    // Start with old content, fetch it
    setServerContent("v1");
    const feed = makeFeed();
    const first = (await fetchYouTubeFeedData(feed)) as RSSFeedWithMetadata;
    expect(first.items).toHaveLength(14);

    // Server updates
    setServerContent("v2");

    // Fetch new content with stale ETag
    const updated = (await fetchYouTubeFeedData(feed, {
      etag: first.fetchMetadata.etag,
      lastModifiedHeader: null,
    })) as RSSFeedWithMetadata;
    expect(updated.items).toHaveLength(15);
    expect(updated.fetchMetadata.etag).toBe(ETAG_V2);

    // Now cache with the new ETag → should get 304
    const cachedAgain = await fetchYouTubeFeedData(feed, {
      etag: updated.fetchMetadata.etag,
      lastModifiedHeader: null,
    });
    expect(cachedAgain).toHaveProperty("notModified", true);

    // Verify the 304 response still returns the current ETag
    const notModified = cachedAgain as NotModifiedResult;
    expect(notModified.fetchMetadata.etag).toBe(ETAG_V2);
  });
});
