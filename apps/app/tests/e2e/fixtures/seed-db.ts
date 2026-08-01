import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { createId } from "@paralleldrive/cuid2";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../../../src/server/db/schema";
import { seedBenchmarkFixture } from "../../../scripts/performance/fixtures";
import { INITIAL_ITEMS_PER_VIEW } from "../../../src/server/api/constants";
import { SELF_HOSTED_RSS_SERVER_PORT } from "./ports";
import type { BenchmarkProfileName } from "../../../scripts/performance/model";
import type { VisibilityFilter } from "../../../src/lib/data/atoms";
import type { MixedViewSectionCase } from "./mixed-view-section-matrix";

const ARTICLE_HTML = Array.from(
  { length: 20 },
  (_, i) =>
    `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>`,
).join("\n");

const PAGE_CAPTURE_READER_HTML = Array.from(
  { length: 100 },
  (_, index) =>
    `<section><h2>Captured section ${index + 1}</h2><p>Captured performance body ${index + 1}. This representative sanitized Page capture exercises the shared article renderer without fetching external resources.</p><blockquote>Captured quotation ${index + 1}</blockquote></section>`,
).join("\n");

function getDb(tursoPort: number) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });
  return { db: drizzle({ client, schema }), client };
}

/**
 * Generates a unique email for test isolation.
 */
export function generateTestEmail() {
  return `test-${randomBytes(8).toString("hex")}@example.com`;
}

/**
 * Deletes a user by email. Cascade deletes clean up sessions, accounts,
 * feeds, feed items, and views.
 */
export async function cleanupUser(tursoPort: number, email: string) {
  const { db, client } = getDb(tursoPort);
  await db.delete(schema.user).where(eq(schema.user.email, email));
  client.close();
}

export async function seedClientPerformanceData(
  tursoPort: number,
  profileName: BenchmarkProfileName,
) {
  const { db, client } = getDb(tursoPort);
  const userId = `client-performance-${uniqueId()}`;
  const email = `${userId}@benchmark.invalid`;
  const password = "testpassword123";
  await seedBenchmarkFixture({ database: db, profileName, userId });
  const pageCaptureFeedItemId = `${userId}-feed-item-000008`;
  await db
    .update(schema.feedItems)
    .set({ content: PAGE_CAPTURE_READER_HTML })
    .where(eq(schema.feedItems.id, pageCaptureFeedItemId));
  const hashedPassword = await hashPassword(password);
  const now = new Date();
  await db.insert(schema.account).values({
    id: createId(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: hashedPassword,
    createdAt: now,
    updatedAt: now,
  });
  client.close();
  return { userId, email, password };
}

export async function getFeedItemProgress(tursoPort: number, id: string) {
  const { db, client } = getDb(tursoPort);
  const feedItem = await db
    .select({ progress: schema.feedItems.progress })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.id, id))
    .get();
  client.close();

  return feedItem?.progress ?? null;
}

export async function getFeedItemWatchLaterState(
  tursoPort: number,
  id: string,
) {
  const { db, client } = getDb(tursoPort);
  const feedItem = await db
    .select({ isWatchLater: schema.feedItems.isWatchLater })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.id, id))
    .get();
  client.close();
  return feedItem?.isWatchLater ?? null;
}

export async function getBookmarkState(tursoPort: number, id: string) {
  const { db, client } = getDb(tursoPort);
  const bookmark = await db
    .select({
      isSaved: schema.bookmarks.isSaved,
      isRead: schema.bookmarks.isRead,
      progress: schema.bookmarks.progress,
      duration: schema.bookmarks.duration,
    })
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.id, id))
    .get();
  client.close();
  return bookmark ?? null;
}

export async function setFeedItemContent(
  tursoPort: number,
  id: string,
  content: string,
) {
  const { db, client } = getDb(tursoPort);
  await db
    .update(schema.feedItems)
    .set({ content })
    .where(eq(schema.feedItems.id, id));
  client.close();
}

export async function setFeedItemAsYouTubeVideo(
  tursoPort: number,
  id: string,
  videoId: string,
) {
  const { db, client } = getDb(tursoPort);
  const feedItem = await db
    .select({ feedId: schema.feedItems.feedId })
    .from(schema.feedItems)
    .where(eq(schema.feedItems.id, id))
    .get();

  if (!feedItem) {
    client.close();
    throw new Error(`No feed item found for ${id}`);
  }

  await db
    .update(schema.feeds)
    .set({ platform: "youtube" })
    .where(eq(schema.feeds.id, feedItem.feedId));
  await db
    .update(schema.feedItems)
    .set({ contentId: videoId, contentType: "video" })
    .where(eq(schema.feedItems.id, id));
  client.close();
}

export async function seedBookmarkProjectionData(
  tursoPort: number,
  email: string,
  feedItemId: string,
) {
  const { db, client } = getDb(tursoPort);
  const [testUser, item, userView] = await Promise.all([
    db.select().from(schema.user).where(eq(schema.user.email, email)).get(),
    db
      .select()
      .from(schema.feedItems)
      .where(eq(schema.feedItems.id, feedItemId))
      .get(),
    db
      .select()
      .from(schema.views)
      .innerJoin(schema.user, eq(schema.views.userId, schema.user.id))
      .where(eq(schema.user.email, email))
      .get(),
  ]);
  if (!testUser || !item || !userView) {
    client.close();
    throw new Error("Bookmark projection seed prerequisites were not found");
  }

  const bookmarkId = `bookmark-${uniqueId()}`;
  const now = new Date();
  await db.insert(schema.bookmarks).values({
    id: bookmarkId,
    userId: testUser.id,
    sourceUrl: item.url,
    canonicalUrl: item.url,
    effectiveUrl: item.url,
    title: "Captured Bookmark",
    author: "Bookmark Author",
    isSaved: true,
    isRead: false,
    createdAt: now,
    updatedAt: now,
    savedUpdatedAt: now,
    readUpdatedAt: now,
    progressUpdatedAt: now,
  });
  await db.insert(schema.bookmarkViews).values({
    bookmarkId,
    viewId: userView.views.id,
  });
  await db.insert(schema.pageCaptures).values({
    bookmarkId,
    contentHtml: `<p>Captured Bookmark body</p>
      <p><a href="https://example.com/next">External reader link</a></p>
      <img src="https://images.example.com/reader.jpg" alt="Reader image" onerror="steal()">
      <div data-serial-embed="youtube" data-video-id="dQw4w9WgXcQ" data-start="42"></div>
      ${ARTICLE_HTML}
      <script data-testid="unsafe-capture-script">steal()</script>`,
    contentHash: `hash-${bookmarkId}`,
    captureSource: "extension-live-dom",
    extractorVersion: "playwright-fixture",
    sanitizerPolicyVersion: 1,
    capturedAt: now,
  });
  client.close();
  return { bookmarkId, viewId: userView.views.id, sourceUrl: item.url };
}

export async function seedBookmarkViewFilterData(
  tursoPort: number,
  email: string,
  bookmarkId: string,
  feedItemId: string,
) {
  const { db, client } = getDb(tursoPort);
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) {
    client.close();
    throw new Error("Bookmark View filter seed user was not found");
  }

  const now = new Date();
  const createdViews = await db
    .insert(schema.views)
    .values(
      ["Bookmark View", "Empty View"].map((name, index) => ({
        userId: testUser.id,
        name,
        daysWindow: 0,
        readStatus: 0,
        contentFilter: 7 as const,
        layout: "list" as const,
        placement: index + 1,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  const bookmarkView = createdViews.find(
    (view) => view.name === "Bookmark View",
  );
  const emptyView = createdViews.find((view) => view.name === "Empty View");
  if (!bookmarkView || !emptyView) {
    client.close();
    throw new Error("Bookmark View filter seed Views were not created");
  }

  await Promise.all([
    db.insert(schema.bookmarkViews).values({
      bookmarkId,
      viewId: bookmarkView.id,
    }),
    db
      .update(schema.feedItems)
      .set({ isWatched: true })
      .where(eq(schema.feedItems.id, feedItemId)),
  ]);
  client.close();

  return { bookmarkViewId: bookmarkView.id, emptyViewId: emptyView.id };
}

export async function seedMixedViewSectionCase(
  tursoPort: number,
  appPort: number,
  testCase: MixedViewSectionCase,
  visibility: VisibilityFilter = "later",
) {
  const {
    email,
    password,
    feedItemId: feedSectionFeedItemId,
  } = await seedArticleData(tursoPort, appPort);
  const { db, client } = getDb(tursoPort);
  const [testUser, feedSectionFeedItem] = await Promise.all([
    db.select().from(schema.user).where(eq(schema.user.email, email)).get(),
    db
      .select()
      .from(schema.feedItems)
      .where(eq(schema.feedItems.id, feedSectionFeedItemId))
      .get(),
  ]);
  if (!testUser || !feedSectionFeedItem) {
    client.close();
    throw new Error("Mixed View section seed prerequisites were not found");
  }

  const testId = uniqueId();
  const now = new Date();
  const farFuture = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365);
  const [tag] = await db
    .insert(schema.contentCategories)
    .values({
      userId: testUser.id,
      name: `Matrix Tag ${testId}`,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!tag) {
    client.close();
    throw new Error("Mixed View section tag was not created");
  }

  const createdFeeds = await db
    .insert(schema.feeds)
    .values(
      ["Tag Section Feed", "Uncategorized Feed", "Outside Feed"].map(
        (name, index) => ({
          userId: testUser.id,
          name: `${name} ${testId}`,
          url: `https://example.com/matrix/${testId}/feed-${index}`,
          imageUrl: "",
          platform: "website",
          openLocation: "serial",
          createdAt: now,
          updatedAt: now,
          lastFetchedAt: now,
          nextFetchAt: farFuture,
        }),
      ),
    )
    .returning();
  const [tagSectionFeed, uncategorizedFeed, outsideFeed] = createdFeeds;
  if (!tagSectionFeed || !uncategorizedFeed || !outsideFeed) {
    client.close();
    throw new Error("Mixed View section feeds were not created");
  }

  const tagSectionFeedItemId = `matrix-tag-feed-${testId}`;
  const uncategorizedFeedItemId = `matrix-uncategorized-feed-${testId}`;
  const outsideFeedItemId = `matrix-outside-feed-${testId}`;
  await db.insert(schema.feedItems).values(
    [
      [tagSectionFeedItemId, tagSectionFeed.id, "Tag Section Feed Item"],
      [
        uncategorizedFeedItemId,
        uncategorizedFeed.id,
        "Uncategorized Feed Item",
      ],
      [outsideFeedItemId, outsideFeed.id, "Outside Feed Item"],
    ].map(([id, feedId, title], index) => ({
      id: id as string,
      feedId: feedId as number,
      contentId: id as string,
      title: `${title} ${testId}`,
      author: "Matrix Author",
      url: `https://example.com/matrix/${testId}/item-${index}`,
      thumbnail: "",
      content: ARTICLE_HTML,
      contentSnippet: "Matrix feed item",
      isWatched: visibility === "read",
      isWatchLater: visibility === "later",
      progress: 0,
      duration: 0,
      orientation: "horizontal",
      postedAt: new Date(now.getTime() - index * 1000),
      createdAt: now,
      updatedAt: now,
      isWatchLaterUpdatedAt: new Date(now.getTime() - index * 1000),
    })),
  );
  await db
    .update(schema.feedItems)
    .set({
      title: `Feed Section Feed Item ${testId}`,
      isWatched: visibility === "read",
      isWatchLater: visibility === "later",
      isWatchedUpdatedAt: new Date(now.getTime() + 1000),
      isWatchLaterUpdatedAt: new Date(now.getTime() + 1000),
    })
    .where(eq(schema.feedItems.id, feedSectionFeedItemId));

  const viewName = `Matrix View ${testId}`;
  const [targetView] = await db
    .insert(schema.views)
    .values({
      userId: testUser.id,
      name: viewName,
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!targetView) {
    client.close();
    throw new Error("Mixed View section target View was not created");
  }
  const emptyViewName = `Matrix Empty View ${testId}`;
  await db.insert(schema.views).values({
    userId: testUser.id,
    name: emptyViewName,
    daysWindow: 0,
    readStatus: 0,
    contentFilter: 7,
    layout: "list",
    placement: 2,
    createdAt: now,
    updatedAt: now,
  });
  await Promise.all([
    db.insert(schema.viewCategories).values({
      viewId: targetView.id,
      categoryId: tag.id,
    }),
    db.insert(schema.viewSections).values([
      {
        viewId: targetView.id,
        placement: 0,
        itemType: "feed",
        itemId: feedSectionFeedItem.feedId,
        layout: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        viewId: targetView.id,
        placement: 1,
        itemType: "tag",
        itemId: tag.id,
        layout: null,
        createdAt: now,
        updatedAt: now,
      },
    ]),
  ]);

  const viewFeedRows = [
    testCase.feedSectionFeedItem ? feedSectionFeedItem.feedId : null,
    testCase.uncategorizedFeedItem ? uncategorizedFeed.id : null,
  ].flatMap((feedId) =>
    feedId === null ? [] : [{ viewId: targetView.id, feedId }],
  );
  if (viewFeedRows.length > 0) {
    await db.insert(schema.viewFeeds).values(viewFeedRows);
  }

  const feedCategoryRows = [
    testCase.feedSectionFeedItem ? feedSectionFeedItem.feedId : null,
    testCase.tagSectionFeedItem ? tagSectionFeed.id : null,
  ].flatMap((feedId) =>
    feedId === null ? [] : [{ feedId, categoryId: tag.id }],
  );
  if (feedCategoryRows.length > 0) {
    await db.insert(schema.feedCategories).values(feedCategoryRows);
  }

  const tagSectionBookmarkId = `matrix-tag-bookmark-${testId}`;
  const uncategorizedBookmarkId = `matrix-uncategorized-bookmark-${testId}`;
  const outsideBookmarkId = `matrix-outside-bookmark-${testId}`;
  const bookmarkRows = [
    [tagSectionBookmarkId, "Tag Section Bookmark"],
    [uncategorizedBookmarkId, "Uncategorized Bookmark"],
    [outsideBookmarkId, "Outside Bookmark"],
  ] as const;
  await db.insert(schema.bookmarks).values(
    bookmarkRows.map(([id], index) => ({
      id,
      userId: testUser.id,
      sourceUrl: `https://example.com/matrix/${testId}/bookmark-${index}`,
      canonicalUrl: `https://example.com/matrix/${testId}/bookmark-${index}`,
      isSaved: visibility === "later",
      isRead: visibility === "read",
      progress: 0,
      duration: 0,
      savedUpdatedAt: new Date(now.getTime() - (index + 4) * 1000),
      readUpdatedAt: now,
      progressUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  );
  await db.insert(schema.pageCaptures).values(
    bookmarkRows.map(([bookmarkId, title], index) => ({
      bookmarkId,
      title: `${title} ${testId}`,
      author: "Matrix Author",
      contentHtml: `<p>${title}</p>`,
      effectiveUrl: `https://example.com/matrix/${testId}/bookmark-${index}`,
      contentHash: `hash-${bookmarkId}`,
      captureSource: "extension-live-dom" as const,
      extractorVersion: "playwright-fixture",
      sanitizerPolicyVersion: 1,
      capturedAt: now,
    })),
  );
  if (testCase.tagSectionBookmark) {
    await db.insert(schema.bookmarkTags).values({
      bookmarkId: tagSectionBookmarkId,
      tagId: tag.id,
    });
  }
  if (testCase.uncategorizedBookmark) {
    await db.insert(schema.bookmarkViews).values({
      bookmarkId: uncategorizedBookmarkId,
      viewId: targetView.id,
    });
  }

  client.close();
  return {
    email,
    password,
    viewId: targetView.id,
    viewName,
    emptyViewName,
    tagName: tag.name,
    items: {
      feedSectionFeedItem: feedSectionFeedItemId,
      tagSectionFeedItem: tagSectionFeedItemId,
      tagSectionBookmark: tagSectionBookmarkId,
      uncategorizedFeedItem: uncategorizedFeedItemId,
      uncategorizedBookmark: uncategorizedBookmarkId,
      outsideFeedItem: outsideFeedItemId,
      outsideBookmark: outsideBookmarkId,
    },
  };
}

export async function getViewsForUser(tursoPort: number, email: string) {
  const { db, client } = getDb(tursoPort);
  const userViews = await db
    .select({
      name: schema.views.name,
      layout: schema.views.layout,
    })
    .from(schema.views)
    .innerJoin(schema.user, eq(schema.views.userId, schema.user.id))
    .where(eq(schema.user.email, email));
  client.close();

  return userViews;
}

function uniqueId() {
  return randomBytes(8).toString("hex");
}

/**
 * Creates a user via the Better Auth sign-up API, then seeds a website feed
 * and article with HTML content directly in the DB.
 *
 * Returns the feed item ID and credentials so the test can log in via the UI.
 */
export async function seedArticleData(
  tursoPort: number,
  appPort: number,
  rssPort: number = SELF_HOSTED_RSS_SERVER_PORT,
): Promise<{
  feedItemId: string;
  email: string;
  password: string;
}> {
  const testId = uniqueId();
  const email = `test-${testId}@example.com`;
  const password = "testpassword123";

  // Create user via API
  const res = await fetch(
    `http://localhost:${appPort}/api/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${appPort}`,
      },
      body: JSON.stringify({ name: "Test User", email, password }),
    },
  );

  if (!res.ok) {
    throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
  }

  const { db, client } = getDb(tursoPort);

  // Find the user by email
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) throw new Error("No user found after sign-up");

  const now = new Date();
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  // Create a default "All" view so items appear on the home page
  const [defaultView] = await db
    .insert(schema.views)
    .values({
      userId: testUser.id,
      name: "All",
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create a website feed (skip re-fetch by setting nextFetchAt far in future)
  const feedUrl = `http://127.0.0.1:${rssPort}/feed/test-blog?t=${testId}`;
  const [testFeed] = await db
    .insert(schema.feeds)
    .values({
      userId: testUser.id,
      name: "Test Blog",
      url: feedUrl,
      imageUrl: "",
      platform: "website",
      openLocation: "serial",
      createdAt: now,
      updatedAt: now,
      lastFetchedAt: now,
      nextFetchAt: farFuture,
    })
    .returning();
  if (!testFeed) throw new Error("Feed insert returned no rows");
  if (!defaultView) throw new Error("Default View insert returned no rows");
  await db.insert(schema.viewFeeds).values({
    viewId: defaultView.id,
    feedId: testFeed.id,
  });

  // Create an article feed item with HTML content
  const feedItemId = `article-${testId}`;
  await db.insert(schema.feedItems).values({
    id: feedItemId,
    feedId: testFeed.id,
    contentId: feedItemId,
    title: "Test Article",
    author: "Test Author",
    url: `http://127.0.0.1:${rssPort}/test-blog/${testId}`,
    thumbnail: "",
    content: ARTICLE_HTML,
    contentSnippet: "Test article content",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  client.close();

  return { feedItemId, email, password };
}

export async function seedSidebarFeedAvailabilityData(
  tursoPort: number,
  appPort: number,
) {
  const base = await seedArticleData(tursoPort, appPort);
  const { db, client } = getDb(tursoPort);
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, base.email))
    .get();
  const targetView = testUser
    ? await db
        .select()
        .from(schema.views)
        .where(eq(schema.views.userId, testUser.id))
        .get()
    : undefined;
  if (!testUser || !targetView) {
    client.close();
    throw new Error("Sidebar Feed availability prerequisites were not found");
  }

  const now = Date.now();
  const feedCount = INITIAL_ITEMS_PER_VIEW + 1;
  const seededFeeds = await db
    .insert(schema.feeds)
    .values(
      Array.from({ length: feedCount }, (_, index) => ({
        userId: testUser.id,
        name:
          index === feedCount - 1
            ? "Globally Populated Overflow Feed"
            : `Sidebar Feed ${index + 1}`,
        url: `https://sidebar.example/${uniqueId()}/${index}.xml`,
        imageUrl: "",
        platform: "website" as const,
        openLocation: "serial" as const,
        isActive: index !== feedCount - 1,
        createdAt: new Date(now - index * 1000),
        updatedAt: new Date(now - index * 1000),
        lastFetchedAt: new Date(now),
        nextFetchAt: new Date(now + 86_400_000),
      })),
    )
    .returning();
  const overflowFeed = seededFeeds.at(-1);
  if (!overflowFeed) {
    client.close();
    throw new Error("Sidebar overflow Feed was not created");
  }

  await Promise.all([
    db.insert(schema.viewFeeds).values(
      seededFeeds.map((feed) => ({
        viewId: targetView.id,
        feedId: feed.id,
      })),
    ),
    db.insert(schema.feedItems).values(
      seededFeeds.map((feed, index) => {
        const id = `sidebar-feed-item-${uniqueId()}`;
        const itemTime = new Date(now - index * 1000);
        return {
          id,
          feedId: feed.id,
          contentId: id,
          contentType: "text" as const,
          title: `Sidebar item ${index + 1}`,
          author: "Sidebar Author",
          url: `https://sidebar.example/items/${id}`,
          postedAt: itemTime,
          createdAt: itemTime,
          updatedAt: itemTime,
        };
      }),
    ),
  ]);

  client.close();
  return {
    email: base.email,
    password: base.password,
    overflowFeedName: overflowFeed.name,
  };
}

export async function seedAddFeedSelectionData(
  tursoPort: number,
  email: string,
) {
  const { db, client } = getDb(tursoPort);
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) throw new Error("No user found while seeding feed selections");

  const now = new Date();
  const tags = await db
    .insert(schema.contentCategories)
    .values(
      ["Zebra", "Alpha", "Priority"].map((name) => ({
        userId: testUser.id,
        name,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  const priorityTag = tags.find((tag) => tag.name === "Priority");
  if (!priorityTag) throw new Error("Priority tag insert returned no row");

  const createdViews = await db
    .insert(schema.views)
    .values(
      ["Zebra View", "Alpha View"].map((name, index) => ({
        userId: testUser.id,
        name,
        daysWindow: 0,
        readStatus: 0,
        contentFilter: 7,
        layout: "list",
        placement: index + 1,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .returning();
  const zebraView = createdViews.find((view) => view.name === "Zebra View");
  if (!zebraView) throw new Error("Zebra view insert returned no row");

  await db.insert(schema.viewSections).values({
    viewId: zebraView.id,
    placement: 0,
    itemType: "tag",
    itemId: priorityTag.id,
    layout: null,
    createdAt: now,
    updatedAt: now,
  });

  client.close();
}

/**
 * Creates a user via the Better Auth sign-up API, then seeds a YouTube feed
 * and video item directly in the DB.
 */
export async function seedYouTubeVideoData(
  tursoPort: number,
  appPort: number,
): Promise<{
  feedItemId: string;
  videoId: string;
  originalUrl: string;
  email: string;
  password: string;
}> {
  const testId = uniqueId();
  const email = `test-${testId}@example.com`;
  const password = "testpassword123";

  const res = await fetch(
    `http://localhost:${appPort}/api/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${appPort}`,
      },
      body: JSON.stringify({ name: "Test User", email, password }),
    },
  );

  if (!res.ok) {
    throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
  }

  const { db, client } = getDb(tursoPort);

  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) throw new Error("No user found after sign-up");

  const now = new Date();
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  const [defaultView] = await db
    .insert(schema.views)
    .values({
      userId: testUser.id,
      name: "All",
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const [testFeed] = await db
    .insert(schema.feeds)
    .values({
      userId: testUser.id,
      name: "Test YouTube Feed",
      url: `https://www.youtube.com/feeds/videos.xml?channel_id=UC${testId.padEnd(22, "0")}`,
      imageUrl: "",
      platform: "youtube",
      openLocation: "serial",
      createdAt: now,
      updatedAt: now,
      lastFetchedAt: now,
      nextFetchAt: farFuture,
    })
    .returning();
  if (!testFeed) throw new Error("Feed insert returned no rows");
  if (!defaultView) throw new Error("Default View insert returned no rows");
  await db.insert(schema.viewFeeds).values({
    viewId: defaultView.id,
    feedId: testFeed.id,
  });

  const videoId = "dQw4w9WgXcQ";
  const originalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const feedItemId = `youtube-${testId}`;

  await db.insert(schema.feedItems).values({
    id: feedItemId,
    feedId: testFeed.id,
    contentId: videoId,
    title: "Test YouTube Video",
    author: "Test Channel",
    url: originalUrl,
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    content: "",
    contentSnippet: "Test YouTube video",
    contentType: "video",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    orientation: "horizontal",
    postedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  client.close();

  return { feedItemId, videoId, originalUrl, email, password };
}

/**
 * Creates a user via the Better Auth sign-up API, then seeds a website feed
 * and multiple articles with HTML content directly in the DB.
 *
 * Returns the feed item IDs and credentials so the test can log in via the UI.
 */
export async function seedMultipleArticleData(
  tursoPort: number,
  appPort: number,
  count: number = 3,
  rssPort: number = SELF_HOSTED_RSS_SERVER_PORT,
): Promise<{
  feedItemIds: string[];
  email: string;
  password: string;
}> {
  const testId = uniqueId();
  const email = `test-${testId}@example.com`;
  const password = "testpassword123";

  // Create user via API
  const res = await fetch(
    `http://localhost:${appPort}/api/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${appPort}`,
      },
      body: JSON.stringify({ name: "Test User", email, password }),
    },
  );

  if (!res.ok) {
    throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
  }

  const { db, client } = getDb(tursoPort);

  // Find the user by email
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) throw new Error("No user found after sign-up");

  const now = new Date();
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  // Create a default "All" view so items appear on the home page
  const [defaultView] = await db
    .insert(schema.views)
    .values({
      userId: testUser.id,
      name: "All",
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Create a website feed (skip re-fetch by setting nextFetchAt far in future)
  const feedUrl = `http://127.0.0.1:${rssPort}/feed/test-blog?t=${testId}`;
  const [testFeed] = await db
    .insert(schema.feeds)
    .values({
      userId: testUser.id,
      name: "Test Blog",
      url: feedUrl,
      imageUrl: "",
      platform: "website",
      openLocation: "serial",
      createdAt: now,
      updatedAt: now,
      lastFetchedAt: now,
      nextFetchAt: farFuture,
    })
    .returning();
  if (!testFeed) throw new Error("Feed insert returned no rows");
  if (!defaultView) throw new Error("Default View insert returned no rows");
  await db.insert(schema.viewFeeds).values({
    viewId: defaultView.id,
    feedId: testFeed.id,
  });

  // Create multiple article feed items with HTML content
  // Stagger postedAt so they have a deterministic order (newest first)
  const feedItemIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const feedItemId = `article-${testId}-${i}`;
    const postedAt = new Date(now.getTime() + (count - i) * 1000);
    await db.insert(schema.feedItems).values({
      id: feedItemId,
      feedId: testFeed.id,
      contentId: feedItemId,
      title: `Test Article ${i + 1}`,
      author: "Test Author",
      url: `http://127.0.0.1:${rssPort}/test-blog/${testId}-${i}`,
      thumbnail: "",
      content: ARTICLE_HTML,
      contentSnippet: "Test article content",
      isWatched: false,
      isWatchLater: false,
      progress: 0,
      duration: 0,
      orientation: "horizontal",
      postedAt,
      createdAt: now,
      updatedAt: now,
    });
    feedItemIds.push(feedItemId);
  }

  client.close();

  return { feedItemIds, email, password };
}

/**
 * Creates a user via the Better Auth sign-up API, then seeds 3 feeds, 3 tags
 * (including one unassigned tag), feed-tag associations, and multiple articles
 * per feed directly in the DB.
 *
 * Returns feed IDs, tag IDs, feed item IDs and credentials so the test can
 * log in via the UI and configure view layouts.
 */
export async function seedViewLayoutData(
  tursoPort: number,
  appPort: number,
  rssPort: number = SELF_HOSTED_RSS_SERVER_PORT,
): Promise<{
  feedIds: number[];
  tagIds: number[];
  feedItemIds: string[];
  email: string;
  password: string;
}> {
  const testId = uniqueId();
  const email = `test-${testId}@example.com`;
  const password = "testpassword123";

  // Create user via API
  const res = await fetch(
    `http://localhost:${appPort}/api/auth/sign-up/email`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: `http://localhost:${appPort}`,
      },
      body: JSON.stringify({ name: "Test User", email, password }),
    },
  );

  if (!res.ok) {
    throw new Error(`Sign-up failed: ${res.status} ${await res.text()}`);
  }

  const { db, client } = getDb(tursoPort);

  // Find the user by email
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .get();
  if (!testUser) throw new Error("No user found after sign-up");

  const now = new Date();
  const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  // Create 3 content categories (tags), leaving one unassigned.
  const tags = await db
    .insert(schema.contentCategories)
    .values([
      { userId: testUser.id, name: "Tech", createdAt: now, updatedAt: now },
      {
        userId: testUser.id,
        name: "News",
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: testUser.id,
        name: "Unassigned Tag",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .returning();
  const tagIds = tags.map((t) => t.id);

  // Create 3 feeds
  const feedNames = ["Tech Feed", "News Feed", "Mixed Feed"];
  const feedIds: number[] = [];
  for (let f = 0; f < 3; f++) {
    const feedUrl = `http://127.0.0.1:${rssPort}/feed/feed-${f}?t=${testId}`;
    const [feed] = await db
      .insert(schema.feeds)
      .values({
        userId: testUser.id,
        name: feedNames[f],
        url: feedUrl,
        imageUrl: "",
        platform: "website",
        openLocation: "serial",
        createdAt: now,
        updatedAt: now,
        lastFetchedAt: now,
        nextFetchAt: farFuture,
      })
      .returning();
    if (!feed) throw new Error(`Feed ${f} insert returned no rows`);
    feedIds.push(feed.id);
  }

  // Associate feeds with tags
  // Feed 0 -> Tech, Feed 1 -> News, Feed 2 -> Tech + News
  const feed0Id = feedIds[0]!;
  const feed1Id = feedIds[1]!;
  const feed2Id = feedIds[2]!;
  const techTagId = tagIds[0]!;
  const newsTagId = tagIds[1]!;
  await db.insert(schema.feedCategories).values([
    { feedId: feed0Id, categoryId: techTagId },
    { feedId: feed1Id, categoryId: newsTagId },
    { feedId: feed2Id, categoryId: techTagId },
    { feedId: feed2Id, categoryId: newsTagId },
  ]);

  // Create 15 articles per feed so sections have enough items to trigger
  // pagination (initial load is 30 items per view)
  const feedItemIds: string[] = [];
  for (let f = 0; f < 3; f++) {
    const feedId = feedIds[f]!;
    for (let i = 0; i < 15; i++) {
      const feedItemId = `article-${testId}-f${f}-i${i}`;
      // Spread dates across a range so earlier sections have items both
      // newer and older than later sections' items, exercising the cursor
      // filter correctly for sectioned views.
      const postedAt = new Date(
        now.getTime() + (45 - (f * 15 + i)) * 86400000 + (2 - f) * 43200000,
      );
      await db.insert(schema.feedItems).values({
        id: feedItemId,
        feedId,
        contentId: feedItemId,
        title: `${feedNames[f]} Article ${i + 1}`,
        author: "Test Author",
        url: `http://127.0.0.1:${rssPort}/feed-${f}/${testId}-${i}`,
        thumbnail: "",
        content: ARTICLE_HTML,
        contentSnippet: "Test article content",
        isWatched: false,
        isWatchLater: false,
        progress: 0,
        duration: 0,
        orientation: "horizontal",
        postedAt,
        createdAt: now,
        updatedAt: now,
      });
      feedItemIds.push(feedItemId);
    }
  }

  client.close();

  return { feedIds, tagIds, feedItemIds, email, password };
}

export async function seedSavedViewClientStateData(
  tursoPort: number,
  appPort: number,
) {
  const fixture = await seedViewLayoutData(tursoPort, appPort);
  const { db, client } = getDb(tursoPort);
  const testUser = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, fixture.email))
    .get();
  if (!testUser) {
    client.close();
    throw new Error("Saved View client-state seed user was not found");
  }

  const now = new Date();
  const viewName = `Client State View ${uniqueId()}`;
  const [targetView] = await db
    .insert(schema.views)
    .values({
      userId: testUser.id,
      name: viewName,
      daysWindow: 0,
      readStatus: 0,
      contentFilter: 7,
      layout: "list",
      placement: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!targetView) {
    client.close();
    throw new Error("Saved View client-state View was not created");
  }

  await db.insert(schema.viewFeeds).values(
    fixture.feedIds.map((feedId) => ({
      viewId: targetView.id,
      feedId,
    })),
  );
  const targetItemId = fixture.feedItemIds[0];
  const initiallySavedItemIds = fixture.feedItemIds.slice(1, 36);
  if (!targetItemId || initiallySavedItemIds.length !== 35) {
    client.close();
    throw new Error("Saved View client-state items were not created");
  }
  await db
    .update(schema.feedItems)
    .set({ isWatchLater: true, isWatchLaterUpdatedAt: now })
    .where(inArray(schema.feedItems.id, initiallySavedItemIds));

  client.close();
  return {
    ...fixture,
    targetItemId,
    targetViewId: targetView.id,
    viewName,
  };
}

/**
 * Verifies that all user-related data has been cleaned up from the database.
 * Queries every table that references a user (directly or transitively) and
 * asserts zero orphaned rows remain.
 */
export async function verifyUserCleanup(tursoPort: number, email: string) {
  const client = createClient({ url: `http://127.0.0.1:${tursoPort}` });

  // Check the user row is gone
  const userResult = await client.execute({
    sql: "SELECT count(*) as c FROM serial_user WHERE email = ?",
    args: [email],
  });
  const userCount = (userResult.rows[0]?.c as number) ?? 0;
  if (userCount > 0) {
    client.close();
    throw new Error(`Expected user ${email} to be deleted, but found a row`);
  }

  // For cascade-dependent tables, verify no orphaned rows reference
  // non-existent parents.
  const queries: Array<{ label: string; sql: string }> = [
    {
      label: "sessions",
      sql: "SELECT count(*) as c FROM serial_session WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
    {
      label: "accounts",
      sql: "SELECT count(*) as c FROM serial_account WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
    {
      label: "feeds",
      sql: "SELECT count(*) as c FROM serial_feed WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
    {
      label: "feed_items",
      sql: "SELECT count(*) as c FROM serial_feed_item WHERE feed_id NOT IN (SELECT id FROM serial_feed)",
    },
    {
      label: "content_categories",
      sql: "SELECT count(*) as c FROM serial_content_categories WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
    {
      label: "feed_categories",
      sql: "SELECT count(*) as c FROM serial_feed_categories WHERE feed_id NOT IN (SELECT id FROM serial_feed) OR category_id NOT IN (SELECT id FROM serial_content_categories)",
    },
    {
      label: "views",
      sql: "SELECT count(*) as c FROM serial_views WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
    {
      label: "view_categories",
      sql: "SELECT count(*) as c FROM serial_view_categories WHERE view_id NOT IN (SELECT id FROM serial_views) OR category_id NOT IN (SELECT id FROM serial_content_categories)",
    },
    {
      label: "view_feeds",
      sql: "SELECT count(*) as c FROM serial_view_feeds WHERE view_id NOT IN (SELECT id FROM serial_views) OR feed_id NOT IN (SELECT id FROM serial_feed)",
    },
    {
      label: "user_config",
      sql: "SELECT count(*) as c FROM serial_user_config WHERE user_id NOT IN (SELECT id FROM serial_user)",
    },
  ];

  const errors: string[] = [];

  for (const q of queries) {
    const result = await client.execute(q.sql);
    const count = (result.rows[0]?.c as number) ?? 0;
    if (count > 0) {
      errors.push(`${q.label}: ${count} orphaned row(s)`);
    }
  }

  client.close();

  if (errors.length > 0) {
    throw new Error(
      `Database cleanup verification failed:\n${errors.join("\n")}`,
    );
  }
}
