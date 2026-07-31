import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedArticleData,
  seedBookmarkProjectionData,
} from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";
import type { Page } from "@playwright/test";

async function persistedValue(page: Page, key: string) {
  return page.evaluate(async (storeKey) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const request = transaction.objectStore("keyval").get(storeKey);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  }, key);
}

async function persistedKeys(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<IDBValidKey[]>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const request = transaction.objectStore("keyval").getAllKeys();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    } finally {
      database.close();
    }
  });
}

test.describe("Bookmark mixed-content synchronization", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("hydrates normalized Bookmarks without eagerly refilling every mixed scope", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId, viewId } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );

    await signIn({ page, email, password });

    await expect
      .poll(
        async () => {
          const bookmarkCache = (await persistedValue(
            page,
            `serial-bookmarks-store::normalized:v1::record:bookmarksDict:${encodeURIComponent(bookmarkId)}`,
          )) as { captureHash?: string } | null;
          return bookmarkCache?.captureHash;
        },
        { timeout: 30_000 },
      )
      .toBe(`hash-${bookmarkId}`);

    const mixedScopePrefix =
      "serial-mixed-content-store::normalized:v1::record:scopes:";
    const mixedScopeKeys = (await persistedKeys(page)).filter(
      (key) => typeof key === "string" && key.startsWith(mixedScopePrefix),
    );
    expect(mixedScopeKeys).toEqual([]);
    expect(viewId).toBeGreaterThan(0);
  });
});
