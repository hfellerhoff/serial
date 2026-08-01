import { createRouterClient } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import {
  applyMigrations,
  createLocalBenchmarkTarget,
  openBenchmarkDatabase,
} from "../../../scripts/performance/database";
import type { ORPCContext } from "~/server/orpc/base";
import {
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  user,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";
import { orpcRouter } from "~/server/orpc/router";

const testState = vi.hoisted((): { database: unknown } => ({
  database: undefined,
}));

vi.mock("~/server/db", () => ({
  get db() {
    return testState.database;
  },
}));
vi.mock("~/server/auth", () => ({ auth: {} }));
vi.mock("~/env", () => ({
  env: {
    BACKGROUND_REFRESH_ENABLED: false,
    DATABASE_URL: "file::memory:",
    KV_STORE: "none",
    PUBLIC_BASE_URL: "http://localhost:3000",
    TRUSTED_ORIGINS: [],
  },
}));

describe("legacy server workload contracts", () => {
  it("does not expose full-library Feed-item or initial View procedures", () => {
    expect("getAll" in orpcRouter.feedItem).toBe(false);
    expect("getAllByView" in orpcRouter.initial).toBe(false);
  });

  it("materializes only one bounded Feed-item page before the first yield", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    try {
      await applyMigrations(session.baseClient);
      const now = new Date("2026-07-31T12:00:00.000Z");
      await session.database.insert(user).values({
        id: "user-one",
        name: "User One",
        email: "user-one@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await session.database.insert(feeds).values({
        id: 1,
        userId: "user-one",
        name: "Feed",
        url: "https://example.com/feed.xml",
        platform: "website",
      });
      await session.database.insert(feedItems).values(
        Array.from({ length: 120 }, (_, index) => ({
          id: `item-${index.toString().padStart(3, "0")}`,
          feedId: 1,
          contentId: `content-${index}`,
          title: `Item ${index}`,
          author: "Author",
          url: `https://example.com/${index}`,
          postedAt: new Date(now.getTime() - index * 1_000),
          createdAt: now,
          updatedAt: now,
        })),
      );

      testState.database = session.database;
      const api = createRouterClient(orpcRouter, {
        context: {
          headers: new Headers(),
          session: { id: "session-one" },
          user: { id: "user-one" },
          db: session.database,
        } as ORPCContext,
      });

      session.instrumentation.reset();
      const stream = await api.feedItem.getByFeedId({ feedId: 1 });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      await iterator.return?.(undefined);

      expect(first.value).toMatchObject({
        type: "feed-items",
        feedItems: { length: 50 },
      });
      expect(session.instrumentation.snapshot()).toMatchObject({
        statementCount: 2,
        materializedRows: 52,
      });
    } finally {
      session.close();
      target.cleanup();
    }
  });

  it("keeps later View pages constant across 3, 10, and 25 Views", async () => {
    async function measureLaterPage(viewCount: number) {
      const target = createLocalBenchmarkTarget();
      const session = openBenchmarkDatabase({ url: target.url });
      try {
        await applyMigrations(session.baseClient);
        const now = new Date("2026-07-31T12:00:00.000Z");
        await session.database.insert(user).values({
          id: "user-one",
          name: "User One",
          email: "user-one@example.com",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        });
        await session.database.insert(feeds).values(
          Array.from({ length: viewCount }, (_, index) => ({
            id: index + 1,
            userId: "user-one",
            name: `Feed ${index + 1}`,
            url: `https://example.com/${index + 1}.xml`,
            platform: "website" as const,
          })),
        );
        await session.database.insert(contentCategories).values(
          Array.from({ length: viewCount }, (_, index) => ({
            id: index + 1,
            userId: "user-one",
            name: `Tag ${index + 1}`,
          })),
        );
        await session.database.insert(views).values(
          Array.from({ length: viewCount }, (_, index) => ({
            id: index + 1,
            userId: "user-one",
            name: `View ${index + 1}`,
            contentFilter: 3 as const,
            layout: "list" as const,
            placement: index,
          })),
        );
        await session.database.insert(feedCategories).values(
          Array.from({ length: viewCount }, (_, index) => ({
            feedId: index + 1,
            categoryId: index + 1,
          })),
        );
        await session.database.insert(viewCategories).values(
          Array.from({ length: viewCount }, (_, index) => ({
            viewId: index + 1,
            categoryId: index + 1,
          })),
        );
        await session.database.insert(viewFeeds).values(
          Array.from({ length: viewCount }, (_, index) => ({
            viewId: index + 1,
            feedId: index + 1,
          })),
        );
        await session.database.insert(viewSections).values(
          Array.from({ length: viewCount }, (_, index) => ({
            viewId: index + 1,
            placement: 0,
            itemType: "feed" as const,
            itemId: index + 1,
          })),
        );
        await session.database.insert(feedItems).values(
          Array.from({ length: 5 }, (_, index) => ({
            id: `item-${index.toString().padStart(3, "0")}`,
            feedId: 1,
            contentId: `content-${index}`,
            title: `Item ${index}`,
            author: "Author",
            url: `https://example.com/item/${index}`,
            orientation: "horizontal",
            postedAt: new Date(now.getTime() - index * 1_000),
            createdAt: now,
            updatedAt: now,
          })),
        );

        testState.database = session.database;
        const api = createRouterClient(orpcRouter, {
          context: {
            headers: new Headers(),
            session: { id: "session-one" },
            user: { id: "user-one" },
            db: session.database,
          } as ORPCContext,
        });

        session.instrumentation.reset();
        const stream = await api.initial.getItemsByVisibility({
          viewId: 1,
          visibilityFilter: "unread",
          cursor: {
            postedAt: new Date(now.getTime() - 1_000),
            id: "item-001",
          },
          limit: 2,
        });
        const iterator = stream[Symbol.asyncIterator]();
        const first = await iterator.next();
        await iterator.return?.(undefined);

        if (first.value?.type === "error") {
          throw new Error(first.value.message);
        }
        expect(first.value).toMatchObject({
          type: "feed-items",
          feedItems: [{ id: "item-002" }, { id: "item-003" }],
          hasMore: true,
        });
        return session.instrumentation.snapshot();
      } finally {
        session.close();
        target.cleanup();
      }
    }

    const measurements = [];
    for (const viewCount of [3, 10, 25]) {
      // Each public procedure call uses the same injected database binding.
      // oxlint-disable-next-line react-doctor/async-await-in-loop
      measurements.push(await measureLaterPage(viewCount));
    }

    expect(
      measurements.map(({ statementCount, materializedRows }) => ({
        statementCount,
        materializedRows,
      })),
    ).toEqual([
      { statementCount: 6, materializedRows: 8 },
      { statementCount: 6, materializedRows: 8 },
      { statementCount: 6, materializedRows: 8 },
    ]);
  });

  it("revalidates only the target View and Uncategorized scopes", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    try {
      await applyMigrations(session.baseClient);
      const now = new Date("2026-07-31T12:00:00.000Z");
      await session.database.insert(user).values({
        id: "user-one",
        name: "User One",
        email: "user-one@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      await session.database.insert(feeds).values(
        Array.from({ length: 25 }, (_, index) => ({
          id: index + 1,
          userId: "user-one",
          name: `Feed ${index + 1}`,
          url: `https://example.com/${index + 1}.xml`,
          platform: "website" as const,
        })),
      );
      await session.database.insert(views).values(
        Array.from({ length: 25 }, (_, index) => ({
          id: index + 1,
          userId: "user-one",
          name: `View ${index + 1}`,
          contentFilter: 3 as const,
          layout: "list" as const,
          placement: index,
        })),
      );
      await session.database.insert(viewFeeds).values(
        Array.from({ length: 25 }, (_, index) => ({
          viewId: index + 1,
          feedId: index + 1,
        })),
      );
      await session.database.insert(viewSections).values(
        Array.from({ length: 25 }, (_, index) => ({
          viewId: index + 1,
          placement: 0,
          itemType: "feed" as const,
          itemId: index + 1,
        })),
      );
      await session.database.insert(feedItems).values(
        Array.from({ length: 5 }, (_, index) => ({
          id: `revalidate-item-${index}`,
          feedId: 1,
          contentId: `revalidate-content-${index}`,
          title: `Item ${index}`,
          author: "Author",
          url: `https://example.com/revalidate/${index}`,
          orientation: "horizontal",
          postedAt: new Date(now.getTime() - index * 1_000),
          createdAt: now,
          updatedAt: now,
        })),
      );

      testState.database = session.database;
      const api = createRouterClient(orpcRouter, {
        context: {
          headers: new Headers(),
          session: { id: "session-one" },
          user: { id: "user-one" },
          db: session.database,
        } as ORPCContext,
      });

      session.instrumentation.reset();
      const stream = await api.initial.revalidateView({ viewId: 1 });
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);

      const targetChunk = chunks.find(
        (chunk) => chunk.type === "feed-items" && chunk.viewId === 1,
      );
      expect(targetChunk?.type).toBe("feed-items");
      if (targetChunk?.type === "feed-items") {
        expect(targetChunk.feedItems).toHaveLength(5);
      }
      expect(session.instrumentation.snapshot()).toMatchObject({
        statementCount: 7,
        materializedRows: 9,
      });
    } finally {
      session.close();
      target.cleanup();
    }
  });

  it("assembles public View results without rescanning association rows per View", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const viewRows = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      userId: "user-one",
      name: `View ${index + 1}`,
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 3 as const,
      layout: "list" as const,
      placement: index,
      createdAt: now,
      updatedAt: now,
    }));
    const categoryRows = Array.from({ length: 25 }, (_, index) => ({
      id: index + 1,
      userId: "user-one",
      name: `Tag ${index + 1}`,
      createdAt: now,
      updatedAt: now,
    }));
    let repeatedAssociationComparisons = 0;
    function trackRepeatedFiltering<T>(rows: T[]) {
      Object.defineProperty(rows, "filter", {
        value: (predicate: (row: T, index: number, rows: T[]) => unknown) => {
          repeatedAssociationComparisons += rows.length;
          const filteredRows: T[] = [];
          rows.forEach((row, index) => {
            if (predicate(row, index, rows)) filteredRows.push(row);
          });
          return filteredRows;
        },
      });
      return rows;
    }
    const rowsByTable = new Map<unknown, unknown[]>([
      [views, viewRows],
      [contentCategories, categoryRows],
      [
        viewCategories,
        trackRepeatedFiltering(
          viewRows.map((view) => ({
            viewId: view.id,
            categoryId: view.id,
          })),
        ),
      ],
      [
        viewFeeds,
        trackRepeatedFiltering(
          viewRows.map((view) => ({ viewId: view.id, feedId: view.id })),
        ),
      ],
      [
        viewSections,
        trackRepeatedFiltering(
          viewRows.map((view) => ({
            id: view.id,
            viewId: view.id,
            placement: 0,
            itemType: "feed" as const,
            itemId: view.id,
            layout: null,
            createdAt: now,
            updatedAt: now,
          })),
        ),
      ],
    ]);
    const fakeDatabase = {
      select() {
        let selectedRows: unknown[] = [];
        const query = {
          from(table: unknown) {
            selectedRows = rowsByTable.get(table) ?? [];
            return query;
          },
          where() {
            return query;
          },
          orderBy() {
            return Promise.resolve(selectedRows);
          },
          then<TFulfilled = unknown[], TRejected = never>(
            onFulfilled?:
              | ((value: unknown[]) => TFulfilled | PromiseLike<TFulfilled>)
              | null,
            onRejected?:
              ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
          ) {
            return Promise.resolve(selectedRows).then(onFulfilled, onRejected);
          },
        };
        return query;
      },
    };

    testState.database = fakeDatabase;
    const api = createRouterClient(orpcRouter, {
      context: {
        headers: new Headers(),
        session: { id: "session-one" },
        user: { id: "user-one" },
        db: fakeDatabase,
      } as unknown as ORPCContext,
    });
    const result = await api.view.getAll();

    expect(result).toHaveLength(26);
    expect(repeatedAssociationComparisons).toBe(0);
  });

  it("rejects oversized Feed, Tag, and View mutation inputs", async () => {
    testState.database = {
      transaction() {
        throw new Error("handler reached");
      },
    };
    const api = createRouterClient(orpcRouter, {
      context: {
        headers: new Headers(),
        session: { id: "session-one" },
        user: { id: "user-one" },
        db: testState.database,
      } as ORPCContext,
    });
    const oversizedIds = Array.from({ length: 501 }, (_, index) => index + 1);
    const operations = [
      () => api.feed.bulkDelete({ feedIds: oversizedIds }),
      () =>
        api.feedCategories.bulkAssignToFeeds({
          feedIds: oversizedIds,
          categoryId: 1,
        }),
      () =>
        api.viewFeeds.bulkAssignToView({ feedIds: oversizedIds, viewId: 1 }),
      () =>
        api.view.updatePlacement({
          views: oversizedIds.map((id) => ({ id, placement: id })),
        }),
    ];

    for (const operation of operations) {
      let rejection: unknown;
      try {
        // oxlint-disable-next-line react-doctor/async-await-in-loop
        await operation();
      } catch (error) {
        rejection = error;
      }
      expect(rejection).toBeDefined();
      expect(String(rejection)).not.toContain("handler reached");
    }
  });

  it("deduplicates maximum-size organization mutations into bounded set-based statements", async () => {
    const target = createLocalBenchmarkTarget();
    const session = openBenchmarkDatabase({ url: target.url });
    try {
      await applyMigrations(session.baseClient);
      const now = new Date("2026-07-31T12:00:00.000Z");
      await session.database.insert(user).values({
        id: "user-one",
        name: "User One",
        email: "user-one@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
      const maximumUniqueIds = Array.from(
        { length: 500 },
        (_, index) => index + 1,
      );
      await session.database.insert(feeds).values(
        maximumUniqueIds.map((id) => ({
          id,
          userId: "user-one",
          name: `Feed ${id}`,
          url: `https://example.com/${id}.xml`,
          platform: "website" as const,
        })),
      );
      await session.database.insert(contentCategories).values([
        { id: 1, userId: "user-one", name: "Bulk" },
        { id: 2, userId: "user-one", name: "State" },
      ]);
      await session.database.insert(feedCategories).values([
        { feedId: 2, categoryId: 2 },
        { feedId: 3, categoryId: 2 },
      ]);
      await session.database.insert(views).values(
        maximumUniqueIds.map((id) => ({
          id,
          userId: "user-one",
          name: `View ${id}`,
          contentFilter: 3 as const,
          layout: "list" as const,
          placement: id,
        })),
      );

      testState.database = session.database;
      const api = createRouterClient(orpcRouter, {
        context: {
          headers: new Headers(),
          session: { id: "session-one" },
          user: { id: "user-one" },
          db: session.database,
        } as ORPCContext,
      });
      const repeatedFeedIds = Array.from(
        { length: 500 },
        (_, index) => (index % 3) + 1,
      );

      session.instrumentation.reset();
      await api.feedCategories.bulkAssignToFeeds({
        feedIds: maximumUniqueIds,
        categoryId: 1,
      });
      expect(session.instrumentation.snapshot()).toMatchObject({
        statementCount: 2,
        materializedRows: 500,
      });

      session.instrumentation.reset();
      await api.contentCategories.update({
        id: 2,
        name: "Updated state",
        feedCategorizations: repeatedFeedIds.map((feedId, index) => ({
          feedId,
          selected: index % 2 === 0,
        })),
      });
      expect(session.instrumentation.snapshot()).toMatchObject({
        statementCount: 4,
        materializedRows: 4,
      });

      session.instrumentation.reset();
      await api.view.updatePlacement({
        views: repeatedFeedIds.map((id, placement) => ({ id, placement })),
      });
      expect(session.instrumentation.snapshot()).toMatchObject({
        statementCount: 1,
        materializedRows: 0,
      });
    } finally {
      session.close();
      target.cleanup();
    }
  });
});
