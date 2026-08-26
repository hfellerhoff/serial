import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import type { PublishedChunk } from "~/server/api/publisher";
import { publisher } from "~/server/api/publisher";
import { runBackgroundFeedRefresh } from "~/server/rss/backgroundRefresh";
import { emptyRefreshStats } from "~/server/rss/stats";
import { feeds, user } from "~/server/db/schema";

type TestDatabase = Awaited<ReturnType<typeof createBookmarkTestDatabase>>;

let testDatabase: TestDatabase;

beforeEach(async () => {
  testDatabase = await createBookmarkTestDatabase();
});

afterEach(() => {
  testDatabase.cleanup();
});

describe("background refresh delivery", () => {
  it("streams background-fetched chunks to a client subscribed to the user channel", async () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    await testDatabase.database.insert(user).values({
      id: "watching-user",
      name: "Watching",
      email: "watching@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await testDatabase.database.insert(feeds).values({
      id: 7,
      userId: "watching-user",
      name: "Feed",
      url: "https://example.com/watching.xml",
      imageUrl: "",
      platform: "website",
      openLocation: "serial",
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });

    const controller = new AbortController();
    const received: PublishedChunk[] = [];
    const subscription = publisher.subscribe("user:watching-user", {
      signal: controller.signal,
    });
    const receiving = (async () => {
      for await (const payload of subscription) {
        received.push(payload);
        if (
          payload.source === "rss" &&
          payload.chunk.type === "rss-attempt-complete"
        ) {
          break;
        }
      }
    })();

    // Let the subscriber attach before publishing.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await runBackgroundFeedRefresh({
      db: testDatabase.database,
      now,
      billingEnabled: true,
      getPlanId: () => Promise.resolve("pro"),
      claimUser: () =>
        Promise.resolve({
          eligible: true as const,
          nextRefreshAt: new Date(now.getTime() + 60_000),
        }),
      publish: async (channel, chunk) => {
        await publisher.publish(channel, { source: "rss", chunk });
      },
      refreshFeedPage: async ({ channel }) => {
        await publisher.publish(channel, {
          source: "rss",
          chunk: {
            type: "feed-items",
            feedId: 7,
            feedItems: [],
          },
        });
        return { ...emptyRefreshStats(), refreshedCount: 1 };
      },
    });

    await receiving;
    controller.abort();

    expect(
      received.map((payload) =>
        payload.source === "rss" ? payload.chunk.type : payload.source,
      ),
    ).toEqual(["refresh-start", "feed-items", "rss-attempt-complete"]);
  });
});
