import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedArticleData } from "../fixtures/seed-db";

test.skip(
  process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION !== "1",
  "The offline PWA check requires the production service worker.",
);

test("reloads a controlled authenticated reader from retained content while offline", async ({
  page,
  context,
}) => {
  const { feedItemId, email, password } = await seedArticleData(
    SELF_HOSTED_TURSO_PORT,
    SELF_HOSTED_APP_PORT,
  );

  try {
    await signIn({ page, email, password });
    const articleCard = page.locator("article").filter({
      hasText: "Test Article",
    });
    await expect(articleCard).toBeVisible({ timeout: 15_000 });

    await page.evaluate(() => navigator.serviceWorker.ready);
    if (
      !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    ) {
      await page.reload();
      await page.evaluate(() => navigator.serviceWorker.ready);
    }
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);

    await page.evaluate(() => {
      navigator.serviceWorker.controller?.postMessage({
        type: "WARM_NAVIGATION_CACHE",
      });
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open("navigation-cache");
          const response = await cache.match("/", { ignoreVary: true });
          return response
            ? { redirected: response.redirected, status: response.status }
            : null;
        }),
      )
      .toEqual({ redirected: false, status: 200 });

    await articleCard.getByRole("link").first().click();
    await expect(page).toHaveURL(new RegExp(`/read/${feedItemId}$`));
    await expect(page.getByText("Paragraph 1:")).toBeVisible();

    const itemStorageKey =
      `serial-application-store::normalized:v1::record:feedItemsDict:` +
      encodeURIComponent(feedItemId);
    const retainedBodyStorageKey =
      `serial-application-store::normalized:v1::record:retainedFeedItemBodyIds:` +
      encodeURIComponent(feedItemId);
    await expect
      .poll(() =>
        page.evaluate(
          async ({ itemKey, retainedBodyKey }) => {
            const database = await new Promise<IDBDatabase>(
              (resolve, reject) => {
                const request = indexedDB.open("keyval-store");
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
              },
            );
            try {
              return await new Promise<boolean>((resolve, reject) => {
                const transaction = database.transaction("keyval", "readonly");
                const store = transaction.objectStore("keyval");
                const itemRequest = store.get(itemKey);
                const retainedBodyRequest = store.get(retainedBodyKey);
                transaction.onerror = () => reject(transaction.error);
                transaction.oncomplete = () =>
                  resolve(
                    itemRequest.result?.content?.includes("Paragraph 1:") ===
                      true && retainedBodyRequest.result === true,
                  );
              });
            } finally {
              database.close();
            }
          },
          { itemKey: itemStorageKey, retainedBodyKey: retainedBodyStorageKey },
        ),
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(new RegExp(`/read/${feedItemId}$`));
    await expect(page.getByText("Paragraph 1:")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();

    await context.setOffline(false);
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeHidden({ timeout: 15_000 });
  } finally {
    await context.setOffline(false);
    await cleanupUser(SELF_HOSTED_TURSO_PORT, email);
  }
});
