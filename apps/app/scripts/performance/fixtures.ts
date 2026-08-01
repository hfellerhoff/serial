import { eq } from "drizzle-orm";
import { BENCHMARK_PROFILES } from "./model";
import type { BenchmarkProfileName } from "./model";
import type { db as applicationDatabase } from "~/server/db";
import {
  bookmarks,
  bookmarkTags,
  bookmarkViews,
  contentCategories,
  feedCategories,
  feedItems,
  feeds,
  pageCaptures,
  user,
  viewCategories,
  viewFeeds,
  views,
  viewSections,
} from "~/server/db/schema";

type Database = typeof applicationDatabase;

const FIXTURE_BATCH_SIZE = 400;
const BASE_TIME = new Date("2026-01-15T12:00:00.000Z");

async function insertInChunks<T>(
  values: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let index = 0; index < values.length; index += FIXTURE_BATCH_SIZE) {
    await insert(values.slice(index, index + FIXTURE_BATCH_SIZE));
  }
}

function timestampFor(index: number) {
  return new Date(BASE_TIME.getTime() - index * 60_000);
}

export async function seedBenchmarkFixture(input: {
  database: Database;
  profileName: BenchmarkProfileName;
  userId: string;
}) {
  const { database, profileName, userId } = input;
  const profile = BENCHMARK_PROFILES[profileName];
  const feedCount = Math.max(profile.views * 4, 12);
  const tagCount = profile.views;

  await database.insert(user).values({
    id: userId,
    name: "Serial performance benchmark",
    email: `${userId}@benchmark.invalid`,
    emailVerified: true,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  });

  await insertInChunks(
    Array.from({ length: feedCount }, (_, index) => ({
      userId,
      name: `Fixture feed ${index}`,
      url: `https://feeds.serial.test/${index}.xml`,
      imageUrl: "",
      platform: index % 3 === 0 ? "youtube" : "website",
      openLocation: "serial" as const,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      lastFetchedAt: BASE_TIME,
      nextFetchAt: new Date("2099-01-01T00:00:00.000Z"),
      isActive: true,
    })),
    (chunk) => database.insert(feeds).values(chunk),
  );
  const feedRows = await database
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.userId, userId));

  await insertInChunks(
    Array.from({ length: tagCount }, (_, index) => ({
      userId,
      name: `Fixture tag ${index}`,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    })),
    (chunk) => database.insert(contentCategories).values(chunk),
  );
  const tagRows = await database
    .select({ id: contentCategories.id })
    .from(contentCategories)
    .where(eq(contentCategories.userId, userId));

  await insertInChunks(
    Array.from({ length: profile.views }, (_, index) => ({
      userId,
      name: index === 0 ? "All benchmark content" : `Fixture view ${index}`,
      daysWindow: 0,
      readStatus: 0,
      orientation: "horizontal" as const,
      contentFilter: 7 as const,
      layout: "list" as const,
      placement: index,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    })),
    (chunk) => database.insert(views).values(chunk),
  );
  const viewRows = await database
    .select({ id: views.id, placement: views.placement })
    .from(views)
    .where(eq(views.userId, userId));
  viewRows.sort((left, right) => left.placement - right.placement);

  const feedCategoryRows = feedRows.map((feed, index) => ({
    feedId: feed.id,
    categoryId: tagRows[index % tagRows.length]!.id,
  }));
  await insertInChunks(feedCategoryRows, (chunk) =>
    database.insert(feedCategories).values(chunk),
  );

  const configuredViews = viewRows.slice(1);
  await insertInChunks(
    configuredViews.map((view, index) => ({
      viewId: view.id,
      categoryId: tagRows[index % tagRows.length]!.id,
    })),
    (chunk) => database.insert(viewCategories).values(chunk),
  );
  await insertInChunks(
    configuredViews.map((view, index) => ({
      viewId: view.id,
      feedId: feedRows[index % feedRows.length]!.id,
    })),
    (chunk) => database.insert(viewFeeds).values(chunk),
  );

  const sectionRows = configuredViews.flatMap((view, index) => [
    {
      viewId: view.id,
      placement: 0,
      itemType: "feed" as const,
      itemId: feedRows[index % feedRows.length]!.id,
      layout: "list" as const,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    },
    {
      viewId: view.id,
      placement: 1,
      itemType: "tag" as const,
      itemId: tagRows[index % tagRows.length]!.id,
      layout: "grid" as const,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    },
  ]);
  await insertInChunks(sectionRows, (chunk) =>
    database.insert(viewSections).values(chunk),
  );

  const feedItemRows: Array<typeof feedItems.$inferInsert> = Array.from(
    { length: profile.feedItems },
    (_, index) => {
      const stateBucket = index % 10;
      const postedAt = timestampFor(index);
      const isWatchLater = stateBucket < 2;
      const isWatched = !isWatchLater && stateBucket < 6;
      return {
        id: `${userId}-feed-item-${index.toString().padStart(6, "0")}`,
        feedId: feedRows[index % feedRows.length]!.id,
        contentId: `fixture-${index}`,
        title: `Fixture item ${index}`,
        author: `Fixture author ${index % 20}`,
        url: `https://content.serial.test/item/${index}`,
        thumbnail: "",
        content: `<p>Fixture body ${index}</p>`,
        contentSnippet: `Fixture summary ${index}`,
        isWatched,
        isWatchLater,
        progress: index % 101,
        duration: 100,
        orientation: index % 5 === 0 ? "vertical" : "horizontal",
        postedAt,
        createdAt: postedAt,
        updatedAt: postedAt,
        isWatchedUpdatedAt: isWatched ? postedAt : null,
        isWatchLaterUpdatedAt: isWatchLater ? postedAt : null,
        contentHash: `feed-hash-${index}`,
      };
    },
  );
  await insertInChunks(feedItemRows, (chunk) =>
    database.insert(feedItems).values(chunk),
  );

  const collisionCount = Math.floor(profile.bookmarks * 0.2);
  const bookmarkRows: Array<typeof bookmarks.$inferInsert> = Array.from(
    { length: profile.bookmarks },
    (_, index) => {
      const stateBucket = index % 10;
      const createdAt = timestampFor(index * 3 + 1);
      const canonicalUrl =
        index < collisionCount
          ? `https://content.serial.test/item/${index * 2}`
          : `https://bookmarks.serial.test/item/${index}`;
      return {
        id: `${userId}-bookmark-${index.toString().padStart(6, "0")}`,
        userId,
        sourceUrl: canonicalUrl,
        canonicalUrl,
        isSaved: stateBucket < 2,
        isRead: stateBucket >= 6,
        progress: index % 101,
        duration: 100,
        savedUpdatedAt: createdAt,
        readUpdatedAt: createdAt,
        progressUpdatedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      };
    },
  );
  await insertInChunks(bookmarkRows, (chunk) =>
    database.insert(bookmarks).values(chunk),
  );
  await insertInChunks(
    bookmarkRows.map((bookmark, index) => ({
      bookmarkId: bookmark.id!,
      title: `Fixture bookmark ${index}`,
      author: `Fixture author ${index % 20}`,
      publishedAt: bookmark.createdAt,
      contentHtml: `<p>Fixture bookmark body ${index}</p>`,
      effectiveUrl: bookmark.canonicalUrl,
      contentHash: `bookmark-hash-${index}`,
      captureSource: "server-static-fetch" as const,
      extractorVersion: "benchmark",
      sanitizerPolicyVersion: 1,
      capturedAt: bookmark.createdAt,
    })),
    (chunk) => database.insert(pageCaptures).values(chunk),
  );

  const bookmarkTagRows = bookmarkRows
    .filter((_, index) => index % 3 === 0)
    .map((bookmark, index) => ({
      bookmarkId: bookmark.id!,
      tagId: tagRows[index % tagRows.length]!.id,
    }));
  await insertInChunks(bookmarkTagRows, (chunk) =>
    database.insert(bookmarkTags).values(chunk),
  );
  const bookmarkViewRows = bookmarkRows
    .filter((_, index) => index % 4 === 0)
    .map((bookmark, index) => ({
      bookmarkId: bookmark.id!,
      viewId: configuredViews[index % configuredViews.length]!.id,
    }));
  await insertInChunks(bookmarkViewRows, (chunk) =>
    database.insert(bookmarkViews).values(chunk),
  );

  return {
    userId,
    allContentViewId: viewRows[0]!.id,
    feedItems: profile.feedItems,
    bookmarks: profile.bookmarks,
    views: profile.views,
    tags: tagCount,
    canonicalCollisions: collisionCount,
  };
}

export async function removeBenchmarkFixture(input: {
  database: Database;
  userId: string;
}) {
  await input.database.delete(user).where(eq(user.id, input.userId));
}
