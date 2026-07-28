import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";

import type { DatabaseFeed } from "~/server/db/schema";
import { fetchAndInsertFeedData } from "~/server/rss/fetchFeeds";

// Mock modules that require env vars
vi.mock("~/server/logger", () => ({
  logMessage: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("~/lib/semaphore", () => ({
  dbSemaphore: { run: <T>(fn: () => T) => fn() },
}));
vi.mock("~/server/rss/feedCache", () => ({
  getCachedFeedResult: vi.fn(() => Promise.resolve(null)),
  setCachedFeedResult: vi.fn(() => Promise.resolve()),
}));

const FIRESHIP_OLD_XML = readFileSync(
  resolvePath(__dirname, "../../e2e/fixtures/fireship-old.xml"),
  "utf-8",
);
const FIRESHIP_XML = readFileSync(
  resolvePath(__dirname, "../../e2e/fixtures/fireship.xml"),
  "utf-8",
);

const ETAG_V1 = '"fireship-integration-v1"';
const ETAG_V2 = '"fireship-integration-v2"';
const LAST_MODIFIED_V1 = "Sat, 05 Apr 2026 18:00:00 GMT";
const LAST_MODIFIED_V2 = "Sun, 06 Apr 2026 18:00:00 GMT";

let currentContent = FIRESHIP_OLD_XML;
let currentEtag = ETAG_V1;
let currentLastModified = LAST_MODIFIED_V1;

let server: Server;
let baseUrl: string;

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

beforeAll(async () => {
  server = createServer((req, res) => {
    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];

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

function createMockDb(existingItems: unknown[] = []) {
  const updateSetCalls: unknown[] = [];
  const insertValuesCalls: unknown[] = [];

  const updateChain = {
    set: vi.fn((val: unknown) => {
      updateSetCalls.push(val);
      return updateChain;
    }),
    where: vi.fn(() => updateChain),
  };

  const insertChain = {
    values: vi.fn((val: unknown) => {
      insertValuesCalls.push(val);
      return insertChain;
    }),
    onConflictDoUpdate: vi.fn(() => insertChain),
    returning: vi.fn(() => []),
  };

  const selectChain = {
    from: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    all: vi.fn(() => existingItems),
  };

  return {
    db: {
      update: vi.fn(() => updateChain),
      insert: vi.fn(() => insertChain),
      select: vi.fn(() => selectChain),
    },
    updateSetCalls,
    insertValuesCalls,
  };
}

describe("fetchAndInsertFeedData with real RSS server", () => {
  it("inserts feed items on first fetch and stores etag/lastModified", async () => {
    setServerContent("v1");
    const feed = makeFeed();
    const { db, updateSetCalls, insertValuesCalls } = createMockDb();

    const results: Array<{ status: string }> = [];
    for await (const result of fetchAndInsertFeedData({ db: db as any }, [
      feed,
    ])) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("success");
    expect(db.insert).toHaveBeenCalled();
    expect(insertValuesCalls.length).toBeGreaterThan(0);

    const feedUpdate = updateSetCalls[0] as Record<string, unknown>;
    expect(feedUpdate.etag).toBe(ETAG_V1);
    expect(feedUpdate.lastModifiedHeader).toBe(LAST_MODIFIED_V1);
  });

  it("skips insert on second fetch when etag matches (304)", async () => {
    setServerContent("v1");
    const feed = makeFeed({ etag: ETAG_V1 });
    const { db, insertValuesCalls, updateSetCalls } = createMockDb();

    const results: Array<{ status: string }> = [];
    for await (const result of fetchAndInsertFeedData({ db: db as any }, [
      feed,
    ])) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("skipped");
    expect(db.insert).not.toHaveBeenCalled();
    expect(insertValuesCalls).toHaveLength(0);

    const feedUpdate = updateSetCalls[0] as Record<string, unknown>;
    expect(feedUpdate).toHaveProperty("lastFetchedAt");
    expect(feedUpdate).toHaveProperty("nextFetchAt");
    expect(feedUpdate).not.toHaveProperty("etag");
    expect(feedUpdate).not.toHaveProperty("lastModifiedHeader");
  });

  it("skips insert on second fetch when Last-Modified matches (304)", async () => {
    setServerContent("v1");
    const feed = makeFeed({ lastModifiedHeader: LAST_MODIFIED_V1 });
    const { db, insertValuesCalls, updateSetCalls } = createMockDb();

    const results: Array<{ status: string }> = [];
    for await (const result of fetchAndInsertFeedData({ db: db as any }, [
      feed,
    ])) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("skipped");
    expect(db.insert).not.toHaveBeenCalled();
    expect(insertValuesCalls).toHaveLength(0);

    // Mirror the etag-version assertions: update should bump fetch
    // bookkeeping but NOT overwrite the cached header fields.
    const feedUpdate = updateSetCalls[0] as Record<string, unknown>;
    expect(feedUpdate).toHaveProperty("lastFetchedAt");
    expect(feedUpdate).toHaveProperty("nextFetchAt");
    expect(feedUpdate).not.toHaveProperty("etag");
    expect(feedUpdate).not.toHaveProperty("lastModifiedHeader");
  });

  it("full lifecycle: first fetch inserts, second fetch skips", async () => {
    setServerContent("v1");
    const feed = makeFeed();
    const { db: db1, updateSetCalls: updates1 } = createMockDb();

    for await (const result of fetchAndInsertFeedData({ db: db1 as any }, [
      feed,
    ])) {
      expect(result.status).toBe("success");
    }

    const firstUpdate = updates1[0] as Record<string, unknown>;
    expect(firstUpdate.etag).toBe(ETAG_V1);

    // Second fetch with cached etag → 304
    const cachedFeed = makeFeed({ etag: firstUpdate.etag as string });
    const { db: db2 } = createMockDb();

    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      cachedFeed,
    ])) {
      expect(result.status).toBe("skipped");
    }

    expect(db2.insert).not.toHaveBeenCalled();
  });

  it("re-fetches when stale etag does not match", async () => {
    setServerContent("v1");
    const feed = makeFeed({ etag: '"outdated-etag"' });
    const { db, insertValuesCalls, updateSetCalls } = createMockDb();

    const results: Array<{ status: string }> = [];
    for await (const result of fetchAndInsertFeedData({ db: db as any }, [
      feed,
    ])) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("success");
    expect(db.insert).toHaveBeenCalled();
    // All 14 items from the v1 fixture should have been inserted
    expect(insertValuesCalls).toHaveLength(1);
    expect((insertValuesCalls[0] as unknown[]).length).toBe(14);

    // The feed update should overwrite the stale etag with the fresh one
    const feedUpdate = updateSetCalls[0] as Record<string, unknown>;
    expect(feedUpdate.etag).toBe(ETAG_V1);
    expect(feedUpdate.lastModifiedHeader).toBe(LAST_MODIFIED_V1);
  });
});

describe("fetchAndInsertFeedData with content update", () => {
  it("inserts only the 1 new item when server updates from v1 to v2", async () => {
    // First fetch with old content (14 items)
    setServerContent("v1");
    const feed = makeFeed();
    const {
      db: db1,
      updateSetCalls: updates1,
      insertValuesCalls: inserts1,
    } = createMockDb();

    for await (const result of fetchAndInsertFeedData({ db: db1 as any }, [
      feed,
    ])) {
      expect(result.status).toBe("success");
    }

    // Should have inserted 14 items (old content)
    expect(inserts1).toHaveLength(1);
    expect((inserts1[0] as unknown[]).length).toBe(14);
    const firstUpdate = updates1[0] as Record<string, unknown>;
    expect(firstUpdate.etag).toBe(ETAG_V1);

    // Capture the 14 items as "existing" DB state (only url + contentHash needed)
    const existingItems = (inserts1[0] as Array<Record<string, unknown>>).map(
      (item) => ({
        url: item.url as string,
        contentHash: item.contentHash as string,
      }),
    );

    // Server publishes a new video (v2 has 15 items — 14 old + 1 new)
    setServerContent("v2");

    // Fetch with stale etag → 200 with new content.
    // DB already has the 14 old items, so diff should detect only 1 new item.
    const {
      db: db2,
      updateSetCalls: updates2,
      insertValuesCalls: inserts2,
    } = createMockDb(existingItems);

    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      makeFeed({ etag: ETAG_V1 }),
    ])) {
      expect(result.status).toBe("success");
    }

    // Should have inserted only the 1 new item
    expect(db2.insert).toHaveBeenCalled();
    expect(inserts2).toHaveLength(1);
    expect((inserts2[0] as unknown[]).length).toBe(1);

    // Verify it's the new "Cursor ditches VS Code" video
    const newItem = (inserts2[0] as Array<Record<string, unknown>>)[0]!;
    expect(newItem.url).toBe("https://www.youtube.com/watch?v=JSuS-zXMVwE");

    // Should store updated etag
    const secondUpdate = updates2[0] as Record<string, unknown>;
    expect(secondUpdate.etag).toBe(ETAG_V2);
    expect(secondUpdate.lastModifiedHeader).toBe(LAST_MODIFIED_V2);
  });

  it("caches again after fetching updated content", async () => {
    // Fetch old content
    setServerContent("v1");
    const { db: db1 } = createMockDb();
    // eslint-disable-next-line no-unused-vars
    for await (const _result of fetchAndInsertFeedData({ db: db1 as any }, [
      makeFeed(),
    ])) {
      // drain
    }

    // Server updates
    setServerContent("v2");

    // Fetch new content with stale etag
    const { db: db2, updateSetCalls: updates2 } = createMockDb();
    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      makeFeed({ etag: ETAG_V1 }),
    ])) {
      expect(result.status).toBe("success");
    }
    const update = updates2[0] as Record<string, unknown>;
    expect(update.etag).toBe(ETAG_V2);

    // Now cache with new etag → 304
    const { db: db3 } = createMockDb();
    for await (const result of fetchAndInsertFeedData({ db: db3 as any }, [
      makeFeed({ etag: ETAG_V2 }),
    ])) {
      expect(result.status).toBe("skipped");
    }
    expect(db3.insert).not.toHaveBeenCalled();
  });
});

describe("fetchAndInsertFeedData content diffing", () => {
  it("skips insert for unchanged items when server returns 200", async () => {
    setServerContent("v1");

    // First fetch to capture real parser output
    const { db: db1, insertValuesCalls: firstInsert } = createMockDb();
    for await (const result of fetchAndInsertFeedData({ db: db1 as any }, [
      makeFeed(),
    ])) {
      expect(result.status).toBe("success");
    }

    // Take only the first 2 items as "existing" — the other 12 are "new"
    const allItems = (firstInsert[0] as Array<Record<string, unknown>>).map(
      (item) => ({
        url: item.url as string,
        contentHash: item.contentHash as string,
      }),
    );
    const twoExisting = allItems.slice(0, 2);

    const { db: db2, insertValuesCalls: secondInsert } =
      createMockDb(twoExisting);

    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      makeFeed(),
    ])) {
      expect(result.status).toBe("success");
    }

    // Should have inserted only the 12 new items, not all 14
    expect(db2.insert).toHaveBeenCalled();
    expect(secondInsert).toHaveLength(1);
    expect((secondInsert[0] as unknown[]).length).toBe(12);
  });

  it("skips insert entirely when all items match existing DB content", async () => {
    setServerContent("v1");

    // First, do a real fetch to capture exactly what the parser produces
    const { db: db1, insertValuesCalls: firstInsert } = createMockDb();
    for await (const result of fetchAndInsertFeedData({ db: db1 as any }, [
      makeFeed(),
    ])) {
      expect(result.status).toBe("success");
    }

    // Use the exact items that were inserted as "existing" DB state
    const insertedItems = (
      firstInsert[0] as Array<Record<string, unknown>>
    ).map((item) => ({
      url: item.url as string,
      contentHash: item.contentHash as string,
    }));

    // Second fetch with all items already in DB
    const { db: db2, insertValuesCalls: secondInsert } =
      createMockDb(insertedItems);

    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      makeFeed(),
    ])) {
      // Still "success" but with empty feedItems
      expect(result.status).toBe("success");
    }

    // No insert should have been called since nothing changed
    expect(db2.insert).not.toHaveBeenCalled();
    expect(secondInsert).toHaveLength(0);
  });

  it("detects title change and upserts only the changed item", async () => {
    setServerContent("v1");

    // First fetch to capture items
    const { db: db1, insertValuesCalls: firstInsert } = createMockDb();
    for await (const result of fetchAndInsertFeedData({ db: db1 as any }, [
      makeFeed(),
    ])) {
      expect(result.status).toBe("success");
    }

    // Simulate a stale DB entry by using a hash that doesn't match
    const insertedItems = firstInsert[0] as Array<Record<string, unknown>>;
    const staleItemUrl = insertedItems[0]!.url as string;
    const freshHash = insertedItems[0]!.contentHash as string;
    const existingItems = insertedItems.map((item) => ({
      url: item.url as string,
      contentHash: item.contentHash as string,
    }));
    existingItems[0]!.contentHash = "stale-hash-that-wont-match";

    // Re-fetch — only the one changed item should be upserted
    const { db: db2, insertValuesCalls: secondInsert } =
      createMockDb(existingItems);

    for await (const result of fetchAndInsertFeedData({ db: db2 as any }, [
      makeFeed(),
    ])) {
      expect(result.status).toBe("success");
    }

    expect(db2.insert).toHaveBeenCalled();
    expect(secondInsert).toHaveLength(1);
    const upserted = secondInsert[0] as Array<Record<string, unknown>>;
    expect(upserted).toHaveLength(1);
    // Verify the upserted item is *the one whose hash diverged*, and that
    // it's being upserted with the fresh content hash (not the stale one).
    expect(upserted[0]!.url).toBe(staleItemUrl);
    expect(upserted[0]!.contentHash).toBe(freshHash);
  });
});
