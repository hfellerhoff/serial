import { randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../../src/server/db/schema";
import { RSS_SERVER_PORT } from "./ports";

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
  const feedUrl = `http://127.0.0.1:${RSS_SERVER_PORT}/feed/test-blog?t=${testId}`;
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
    url: `http://127.0.0.1:${RSS_SERVER_PORT}/test-blog/${testId}`,
    thumbnail: "",
    content: ARTICLE_HTML,
    contentSnippet: "Test article content",
    isWatched: false,
    isWatchLater: false,
    progress: 0,
    duration: 0,
    postedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  client.close();

  return { feedItemId, email, password };
}
