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

async function persistedStore(page: Page, key: string) {
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

test.describe("Bookmark mixed-content synchronization", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("hydrates separate Bookmark and mixed caches with canonical suppression", async ({
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
          const bookmarkCache = (await persistedStore(
            page,
            "serial-bookmarks-store",
          )) as {
            state?: { bookmarksDict?: Record<string, { captureHash: string }> };
          } | null;
          return bookmarkCache?.state?.bookmarksDict?.[bookmarkId]?.captureHash;
        },
        { timeout: 30_000 },
      )
      .toBe(`hash-${bookmarkId}`);

    await expect
      .poll(
        async () => {
          const mixedCache = (await persistedStore(
            page,
            "serial-mixed-content-store",
          )) as {
            state?: {
              scopes?: Record<
                string,
                { references: Array<{ entityKind: string; entityId: string }> }
              >;
            };
          } | null;
          const scopes = mixedCache?.state?.scopes;
          return {
            saved:
              scopes?.[`view:${viewId}:later`]?.references.map(
                ({ entityKind, entityId }) => ({ entityKind, entityId }),
              ) ?? null,
            unread:
              scopes?.[`view:${viewId}:unread`]?.references.map(
                ({ entityKind, entityId }) => ({ entityKind, entityId }),
              ) ?? null,
          };
        },
        { timeout: 30_000 },
      )
      .toEqual({
        saved: [{ entityKind: "bookmark", entityId: bookmarkId }],
        unread: [],
      });
  });
});
