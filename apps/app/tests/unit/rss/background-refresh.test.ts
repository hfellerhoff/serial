import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import type { RefreshStats } from "~/server/rss/refreshUserFeeds";
import { runBackgroundFeedRefresh } from "~/server/rss/backgroundRefresh";
import { feeds, user } from "~/server/db/schema";

type TestDatabase = Awaited<ReturnType<typeof createBookmarkTestDatabase>>;

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createBookmarkTestDatabase();
});

afterEach(() => {
  testDatabase.cleanup();
});

const EMPTY_REFRESH_STATS: RefreshStats = {
  refreshedCount: 0,
  skippedCount: 0,
  emptyCount: 0,
  errorCount: 0,
  totalRowsWritten: 0,
  affectedFeeds: [],
  originFailureFeedIds: [],
};

describe("runBackgroundFeedRefresh", () => {
  it("claims due users and Feeds in bounded cursor pages", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const users = Array.from({ length: 27 }, (_, index) => ({
      id: `user-${index.toString().padStart(2, "0")}`,
      name: `User ${index}`,
      email: `user-${index}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }));
    await testDatabase.database.insert(user).values(users);

    const dueFeeds = users.flatMap((candidate) =>
      Array.from({ length: 51 }, (_, index) => ({
        userId: candidate.id,
        name: `Feed ${index}`,
        url: `https://example.com/${candidate.id}/${index}.xml`,
        imageUrl: "",
        platform: "website",
        openLocation: "serial",
        createdAt: now,
        updatedAt: now,
        isActive: true,
      })),
    );
    for (let index = 0; index < dueFeeds.length; index += 200) {
      await testDatabase.database
        .insert(feeds)
        .values(dueFeeds.slice(index, index + 200));
    }

    const feedPageSizes: number[] = [];
    const publishedChunkTypes: string[] = [];
    const publish = vi.fn((_channel: string, chunk: { type: string }) => {
      publishedChunkTypes.push(chunk.type);
      return Promise.resolve();
    });
    const metrics = await runBackgroundFeedRefresh({
      db: testDatabase.database,
      now,
      billingEnabled: false,
      claimUser: () =>
        Promise.resolve({
          eligible: true as const,
          nextRefreshAt: new Date(now.getTime() + 60_000),
        }),
      publish,
      refreshFeedPage: ({ feedsList }) => {
        feedPageSizes.push(feedsList.length);
        return Promise.resolve(EMPTY_REFRESH_STATS);
      },
    });

    expect(metrics.userPages).toBe(2);
    expect(metrics.feedPages).toBe(54);
    expect(metrics.maximumUserPageSize).toBe(25);
    expect(metrics.maximumFeedPageSize).toBe(50);
    expect(feedPageSizes.every((size) => size <= 50)).toBe(true);
    expect(
      publishedChunkTypes.filter((type) => type === "refresh-start"),
    ).toHaveLength(27);
    expect(
      publishedChunkTypes.filter((type) => type === "refresh-complete"),
    ).toHaveLength(0);
    expect(
      publishedChunkTypes.filter((type) => type === "navigation-snapshot"),
    ).toHaveLength(0);
    expect(
      publishedChunkTypes.filter((type) => type === "rss-attempt-complete"),
    ).toHaveLength(27);
  });

  it("bounds plan cache and provider resolution to four users", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    await testDatabase.database.insert(user).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: `paid-${index.toString().padStart(2, "0")}`,
        name: `Paid ${index}`,
        email: `paid-${index}@example.com`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    );

    await testDatabase.database.insert(feeds).values(
      Array.from({ length: 10 }, (_, index) => ({
        userId: `paid-${index.toString().padStart(2, "0")}`,
        name: "Feed",
        url: `https://example.com/paid-${index}.xml`,
        imageUrl: "",
        platform: "website",
        openLocation: "serial",
        createdAt: now,
        updatedAt: now,
        isActive: true,
      })),
    );

    let activePlanRequests = 0;
    let maximumActivePlanRequests = 0;
    const metrics = await runBackgroundFeedRefresh({
      db: testDatabase.database,
      now,
      billingEnabled: true,
      getPlanId: async () => {
        activePlanRequests++;
        maximumActivePlanRequests = Math.max(
          maximumActivePlanRequests,
          activePlanRequests,
        );
        await new Promise((resolve) => setTimeout(resolve, 5));
        activePlanRequests--;
        return "pro";
      },
      claimUser: () =>
        Promise.resolve({
          eligible: true as const,
          nextRefreshAt: new Date(now.getTime() + 60_000),
        }),
      publish: () => Promise.resolve(),
      refreshFeedPage: () => Promise.resolve(EMPTY_REFRESH_STATS),
    });

    expect(metrics.usersClaimed).toBe(10);
    expect(maximumActivePlanRequests).toBeLessThanOrEqual(4);
  });

  it("claims and fetches a due paid user with no connected client", async () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    await testDatabase.database.insert(user).values({
      id: "away-user",
      name: "Away",
      email: "away@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await testDatabase.database.insert(feeds).values(
      Array.from({ length: 3 }, (_, index) => ({
        userId: "away-user",
        name: `Feed ${index}`,
        url: `https://example.com/away/${index}.xml`,
        imageUrl: "",
        platform: "website",
        openLocation: "serial",
        createdAt: now,
        updatedAt: now,
        isActive: true,
      })),
    );

    const fetchedFeedCounts: number[] = [];
    const publishedChunkTypes: string[] = [];
    const metrics = await runBackgroundFeedRefresh({
      db: testDatabase.database,
      now,
      billingEnabled: true,
      getPlanId: () => Promise.resolve("standard-small"),
      claimUser: () =>
        Promise.resolve({
          eligible: true as const,
          nextRefreshAt: new Date(now.getTime() + 60_000),
        }),
      publish: (_channel, chunk) => {
        publishedChunkTypes.push(chunk.type);
        return Promise.resolve();
      },
      refreshFeedPage: ({ feedsList }) => {
        fetchedFeedCounts.push(feedsList.length);
        return Promise.resolve(EMPTY_REFRESH_STATS);
      },
    });

    expect(metrics.usersClaimed).toBe(1);
    expect(metrics.totalDueFeeds).toBe(3);
    expect(fetchedFeedCounts).toEqual([3]);
    expect(publishedChunkTypes).toEqual([
      "refresh-start",
      "rss-attempt-complete",
    ]);
  });

  it("skips users with no due Feeds before claiming when billing is enabled", async () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    await testDatabase.database.insert(user).values({
      id: "idle-user",
      name: "Idle",
      email: "idle@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await testDatabase.database.insert(feeds).values({
      userId: "idle-user",
      name: "Fresh feed",
      url: "https://example.com/idle/fresh.xml",
      imageUrl: "",
      platform: "website",
      openLocation: "serial",
      createdAt: now,
      updatedAt: now,
      isActive: true,
      nextFetchAt: new Date(now.getTime() + 10 * 60_000),
    });

    const claimUser = vi.fn(() =>
      Promise.resolve({
        eligible: true as const,
        nextRefreshAt: new Date(now.getTime() + 60_000),
      }),
    );
    const publish = vi.fn(() => Promise.resolve());
    const refreshFeedPage = vi.fn(() => Promise.resolve(EMPTY_REFRESH_STATS));
    const metrics = await runBackgroundFeedRefresh({
      db: testDatabase.database,
      now,
      billingEnabled: true,
      getPlanId: () => Promise.resolve("pro"),
      claimUser,
      publish,
      refreshFeedPage,
    });

    expect(metrics.usersClaimed).toBe(0);
    expect(claimUser).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(refreshFeedPage).not.toHaveBeenCalled();
  });
});
