import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../src/server/db/schema";
import { SELF_HOSTED_RSS_SERVER_PORT } from "./ports";

const ARTICLE_HTML = Array.from(
  { length: 20 },
  (_, i) =>
    `<p>Paragraph ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>`,
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
  await db.insert(schema.views).values({
    userId: testUser.id,
    name: "All",
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "all",
    layout: "list",
    placement: 0,
    createdAt: now,
    updatedAt: now,
  });

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
  await db.insert(schema.views).values({
    userId: testUser.id,
    name: "All",
    daysWindow: 0,
    readStatus: 0,
    orientation: "horizontal",
    contentType: "all",
    layout: "list",
    placement: 0,
    createdAt: now,
    updatedAt: now,
  });

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
 * Creates a user via the Better Auth sign-up API, then seeds 3 feeds, 2 tags,
 * feed-tag associations, and multiple articles per feed directly in the DB.
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

  // Create 2 content categories (tags)
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
