import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedArticleData,
  seedBookmarkProjectionData,
  seedBookmarkViewFilterData,
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

  test("hydrates normalized Bookmarks without eagerly fetching mixed scopes", async ({
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
      "serial-mixed-content-store-v2::normalized:v1::record:scopes:";
    const mixedScopeKeys = (await persistedKeys(page)).filter(
      (key) => typeof key === "string" && key.startsWith(mixedScopePrefix),
    );
    expect(mixedScopeKeys).toEqual([]);
    expect(viewId).toBeGreaterThan(0);
  });

  test("shows Bookmarks only in assigned Views and marks only populated View chips", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );
    await seedBookmarkViewFilterData(
      SELF_HOSTED_TURSO_PORT,
      email,
      bookmarkId,
      feedItemId,
    );

    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();
    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );

    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    const bookmarkViewChip = feedMain.getByRole("radio", {
      name: "Bookmark View",
    });
    const emptyViewChip = feedMain.getByRole("radio", {
      name: "Empty View",
    });
    await expect(bookmarkViewChip).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() =>
        bookmarkViewChip.evaluate((element) =>
          element.classList.contains("opacity-50"),
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        emptyViewChip.evaluate((element) =>
          element.classList.contains("opacity-50"),
        ),
      )
      .toBe(true);

    await page.evaluate(() => {
      const state = window as typeof window & {
        __serialSkeletonSeen?: boolean;
        __serialSkeletonObserver?: MutationObserver;
      };
      state.__serialSkeletonSeen = false;
      state.__serialSkeletonObserver = new MutationObserver(() => {
        if (document.querySelector(".animate-pulse")) {
          state.__serialSkeletonSeen = true;
        }
      });
      state.__serialSkeletonObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });

    await bookmarkViewChip.click();
    await expect(bookmarkCard).toBeVisible();

    await emptyViewChip.click();
    await expect(bookmarkCard).toHaveCount(0);
    expect(
      await page.evaluate(() => {
        const state = window as typeof window & {
          __serialSkeletonSeen?: boolean;
          __serialSkeletonObserver?: MutationObserver;
        };
        state.__serialSkeletonObserver?.disconnect();
        return state.__serialSkeletonSeen;
      }),
    ).toBe(false);
  });
});
