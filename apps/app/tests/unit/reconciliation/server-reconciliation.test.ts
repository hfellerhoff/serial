import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBookmarkTestDatabase } from "../bookmarks/database";
import type { ReconciliationInput } from "~/lib/reconciliation";
import { getFeedItemReconciliationVersion } from "~/lib/reconciliation";
import {
  bookmarks,
  bookmarkViews,
  feedItems,
  feeds,
  user,
  viewFeeds,
  views,
} from "~/server/db/schema";
import { reconcileApplicationState } from "~/server/reconciliation";
import * as mixedContentProjection from "~/server/mixed-content/projection";

type MixedContentProjectionModule = typeof mixedContentProjection;

vi.mock("~/server/mixed-content/projection", async (importOriginal) => {
  const original = await importOriginal<MixedContentProjectionModule>();
  return {
    ...original,
    queryMixedContentPage: vi.fn(original.queryMixedContentPage),
  };
});

type TestDatabase = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["database"];
type Cleanup = Awaited<
  ReturnType<typeof createBookmarkTestDatabase>
>["cleanup"];

const NOW = new Date("2026-08-10T12:00:00.000Z");

let database: TestDatabase;
let cleanup: Cleanup;

beforeEach(async () => {
  const original = await vi.importActual<MixedContentProjectionModule>(
    "~/server/mixed-content/projection",
  );
  vi.mocked(mixedContentProjection.queryMixedContentPage).mockImplementation(
    original.queryMixedContentPage,
  );
  ({ database, cleanup } = await createBookmarkTestDatabase());
  await database.insert(user).values({
    id: "reconciliation-user",
    name: "Reconciliation user",
    email: "reconciliation@example.com",
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
});

afterEach(() => cleanup());

async function collect(request: ReconciliationInput) {
  const events = [];
  for await (const event of reconcileApplicationState({
    database,
    userId: "reconciliation-user",
    request,
  })) {
    events.push(event);
  }
  return events;
}

describe("server reconciliation", () => {
  it("continues targeted View repairs after one page fails", async () => {
    await database.insert(views).values(
      [10, 11, 12].map((id, placement) => ({
        id,
        userId: "reconciliation-user",
        name: `View ${id}`,
        contentFilter: 3,
        placement,
      })),
    );
    const original = await vi.importActual<MixedContentProjectionModule>(
      "~/server/mixed-content/projection",
    );
    vi.mocked(mixedContentProjection.queryMixedContentPage).mockImplementation(
      async (input) => {
        if (input.scope.type === "view" && input.scope.viewId === 11) {
          throw new Error("temporary View 11 failure");
        }
        return original.queryMixedContentPage(input);
      },
    );

    const targets = [10, 11, 12].map((viewId) => ({
      target: {
        type: "scope" as const,
        scope: { type: "view" as const, viewId },
        contentStatus: {
          saveStatus: "inbox" as const,
          archiveStatus: "unread" as const,
        },
      },
      pageManifest: { feedItems: [], bookmarks: [] },
      membershipRevision: 4,
    }));
    const events = await collect({
      type: "targeted",
      reconciliationId: "partial-targeted-repair",
      targets,
    });

    expect(
      events.flatMap(({ chunk }) =>
        chunk.type === "active-first-page" &&
        chunk.page.target.scope.type === "view"
          ? [chunk.page.target.scope.viewId]
          : [],
      ),
    ).toEqual([10, 12]);
    expect(
      events.find(({ chunk }) => chunk.type === "domain-error")?.chunk,
    ).toEqual({
      type: "domain-error",
      failure: {
        phase: "load-view-page",
        domain: "active-scope",
        target: targets[1]?.target,
        message: "temporary View 11 failure",
      },
    });
    expect(events.at(-1)?.chunk).toEqual({
      type: "epoch-complete",
      requiredDomains: ["active-scope"],
    });
  });

  it("returns authoritative membership while omitting an unchanged entity body", async () => {
    await database.insert(views).values({
      id: 10,
      userId: "reconciliation-user",
      name: "Reading",
      contentFilter: 3,
      placement: 1,
    });
    await database.insert(feeds).values({
      id: 20,
      userId: "reconciliation-user",
      name: "Reading feed",
      url: "https://example.com/feed.xml",
      platform: "website",
    });
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 20 });
    await database.insert(feedItems).values({
      id: "unchanged-feed-item",
      feedId: 20,
      contentId: "unchanged-feed-item",
      title: "Feed item",
      author: "Author",
      url: "https://example.com/unchanged",
      postedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const initial = await collect({
      type: "full",
      reconciliationId: "manifest-source",
      selection: {
        type: "cold",
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        membershipRevision: 0,
      },
    });
    const initialPage = initial.find(
      ({ chunk }) => chunk.type === "active-first-page",
    );
    if (initialPage?.chunk.type !== "active-first-page") {
      throw new Error("Expected source page");
    }
    const entityDiff = initialPage.chunk.page.feedItemDiffs[0];
    if (entityDiff?.status !== "upsert") {
      throw new Error("Expected source entity");
    }

    const events = await collect({
      type: "full",
      reconciliationId: "manifest-match",
      selection: {
        type: "selected",
        scope: { type: "view", viewId: 10 },
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        pageManifest: {
          feedItems: [
            {
              id: entityDiff.entity.id,
              version: getFeedItemReconciliationVersion(entityDiff.entity),
            },
          ],
          bookmarks: [],
        },
        membershipRevision: 7,
      },
    });
    const activePage = events.find(
      ({ chunk }) => chunk.type === "active-first-page",
    );
    if (activePage?.chunk.type !== "active-first-page") {
      throw new Error("Expected reconciled page");
    }

    expect(activePage.chunk.page.orderedRefs).toHaveLength(1);
    expect(activePage.chunk.page.feedItemDiffs).toEqual([
      { status: "unchanged", id: "unchanged-feed-item" },
    ]);
    expect(activePage.chunk.page.membershipRevision).toBe(7);
  });

  it("resolves a cold View and streams one complete page with independent matching rows", async () => {
    await database.insert(views).values({
      id: 10,
      userId: "reconciliation-user",
      name: "Reading",
      contentFilter: 3,
      placement: 1,
    });
    await database.insert(feeds).values({
      id: 20,
      userId: "reconciliation-user",
      name: "Reading feed",
      url: "https://example.com/feed.xml",
      platform: "website",
    });
    await database.insert(viewFeeds).values({ viewId: 10, feedId: 20 });
    await database.insert(feedItems).values({
      id: "matching-feed-item",
      feedId: 20,
      contentId: "matching-feed-item",
      title: "Feed item",
      author: "Author",
      url: "https://example.com/article",
      normalizedUrl: "https://example.com/article",
      postedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await database.insert(bookmarks).values({
      id: "matching-bookmark",
      userId: "reconciliation-user",
      sourceUrl: "https://example.com/article",
      effectiveUrl: "https://example.com/article",
      canonicalUrl: "https://example.com/article",
      isSaved: false,
      savedUpdatedAt: NOW,
      readUpdatedAt: NOW,
      progressUpdatedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await database
      .insert(bookmarkViews)
      .values({ bookmarkId: "matching-bookmark", viewId: 10 });

    const events = await collect({
      type: "full",
      reconciliationId: "cold-1",
      selection: {
        type: "cold",
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        membershipRevision: 4,
      },
    });

    expect(events.slice(0, 2).map(({ chunk }) => chunk.type)).toEqual([
      "organization-snapshot",
      "domain-complete",
    ]);
    const chunkTypes = events.map(({ chunk }) => chunk.type);
    const navigationIndex = chunkTypes.indexOf("navigation-snapshot");
    const firstPageIndex = chunkTypes.indexOf("active-first-page");
    const matrixStartIndex = chunkTypes.indexOf(
      "active-first-page",
      firstPageIndex + 1,
    );
    expect(navigationIndex).toBeGreaterThan(firstPageIndex);
    expect(navigationIndex).toBeLessThan(matrixStartIndex);
    expect(chunkTypes[navigationIndex + 1]).toBe("domain-complete");
    expect(chunkTypes.slice(-2)).toEqual([
      "automatic-rss-owner",
      "epoch-complete",
    ]);
    expect(events.every((event) => event.reconciliationId === "cold-1")).toBe(
      true,
    );

    const organization = events.find(
      ({ chunk }) => chunk.type === "organization-snapshot",
    );
    if (organization?.chunk.type !== "organization-snapshot") {
      throw new Error("Expected organization snapshot");
    }
    expect(organization.chunk.snapshot.directViewFeeds).toEqual([
      { viewId: 10, feedId: 20 },
    ]);
    expect(organization.chunk.snapshot.effectiveViewFeeds).toContainEqual({
      viewId: 10,
      feedIds: [20],
    });

    const viewPages = events.flatMap(({ chunk }) =>
      chunk.type === "active-first-page" ? [chunk.page] : [],
    );
    expect(viewPages).toHaveLength(8);
    expect(
      new Set(
        viewPages.map(
          ({ target }) =>
            `${target.scope.type === "view" ? target.scope.viewId : "other"}:${target.contentStatus.saveStatus}:${target.contentStatus.archiveStatus}`,
        ),
      ).size,
    ).toBe(8);
    const activePage = events.find(
      ({ chunk }) => chunk.type === "active-first-page",
    );
    expect(activePage?.chunk).toMatchObject({
      type: "active-first-page",
      page: {
        target: {
          type: "scope",
          scope: { type: "view", viewId: 10 },
          contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        },
        membershipRevision: 4,
      },
    });
    if (activePage?.chunk.type !== "active-first-page") {
      throw new Error("Expected active page");
    }
    expect(
      activePage.chunk.page.orderedRefs.map(({ entityId }) => entityId),
    ).toEqual(
      expect.arrayContaining(["matching-bookmark", "matching-feed-item"]),
    );
    expect(activePage.chunk.page.orderedRefs).toHaveLength(2);

    const completed = events.at(-1);
    expect(completed?.chunk).toEqual({
      type: "epoch-complete",
      requiredDomains: ["organization", "active-scope", "navigation"],
    });
  });

  it("terminates an unavailable explicit selection with structured scope context", async () => {
    const events = await collect({
      type: "full",
      reconciliationId: "stale-selection",
      selection: {
        type: "selected",
        scope: { type: "view", viewId: 404 },
        contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        pageManifest: {
          feedItems: [],
          bookmarks: [],
        },
        membershipRevision: 2,
      },
    });

    expect(events.map(({ chunk }) => chunk.type)).toEqual([
      "organization-snapshot",
      "domain-complete",
      "domain-error",
    ]);
    expect(events.at(-1)?.chunk).toEqual({
      type: "domain-error",
      failure: {
        phase: "resolve-selection",
        domain: "active-scope",
        target: {
          type: "scope",
          scope: { type: "view", viewId: 404 },
          contentStatus: { saveStatus: "inbox", archiveStatus: "unread" },
        },
        message: "The selected reconciliation scope is unavailable",
      },
    });
  });
});
