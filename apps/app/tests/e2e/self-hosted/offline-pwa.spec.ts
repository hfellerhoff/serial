import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedArticleData,
  seedBookmarkProjectionData,
  seedMultipleArticleData,
  setFeedItemAsVideo,
  setFeedItemWatchLater,
} from "../fixtures/seed-db";
import type { Page } from "@playwright/test";

test.skip(
  process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION !== "1",
  "The offline PWA check requires the production service worker.",
);

async function prepareControlledShell(page: Page) {
  const serviceWorkerResponse = await page.request.get("/sw.js");
  expect(serviceWorkerResponse.status()).toBe(200);
  expect(serviceWorkerResponse.headers()["content-type"]).toContain(
    "javascript",
  );

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
}

async function getFeedBodyPersistence(page: Page, itemId: string) {
  return page.evaluate(async (id) => {
    const itemKey =
      `serial-application-store::normalized:v1::record:feedItemsDict:` +
      encodeURIComponent(id);
    const retainedBodyKey =
      `serial-application-store::normalized:v1::record:retainedFeedItemBodyIds:` +
      encodeURIComponent(id);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<{
        hasBody: boolean;
        isWatchLater: boolean | undefined;
        isWatched: boolean | undefined;
        retained: boolean;
      }>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const store = transaction.objectStore("keyval");
        const itemRequest = store.get(itemKey);
        const retainedBodyRequest = store.get(retainedBodyKey);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => {
          const item = itemRequest.result as
            | {
                content?: string;
                isWatchLater?: boolean;
                isWatched?: boolean;
              }
            | undefined;
          resolve({
            hasBody: item?.content?.includes("Paragraph 1:") === true,
            isWatchLater: item?.isWatchLater,
            isWatched: item?.isWatched,
            retained: retainedBodyRequest.result === true,
          });
        };
      });
    } finally {
      database.close();
    }
  }, itemId);
}

async function hasBookmarkCapture(page: Page, bookmarkId: string) {
  return page.evaluate(async (id) => {
    const captureKey =
      `serial-bookmark-captures-store::normalized:v1::record:capturesDict:` +
      encodeURIComponent(id);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<boolean>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const request = transaction.objectStore("keyval").get(captureKey);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () =>
          resolve(
            request.result?.contentHtml?.includes("Captured Bookmark body") ===
              true,
          );
      });
    } finally {
      database.close();
    }
  }, bookmarkId);
}

test("keeps only retained text interactive and read-only after an offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const { feedItemIds, email, password } = await seedMultipleArticleData(
    SELF_HOSTED_TURSO_PORT,
    SELF_HOSTED_APP_PORT,
    3,
  );
  const [retainedItemId, unavailableItemId, videoItemId] = feedItemIds;
  if (!retainedItemId || !unavailableItemId || !videoItemId) {
    throw new Error("Offline PWA fixture did not create three feed items");
  }
  await setFeedItemAsVideo(SELF_HOSTED_TURSO_PORT, videoItemId, "M7lc1UVf-VE");

  try {
    await signIn({ page, email, password });
    const retainedCard = page.locator(
      `article[data-item-id="${retainedItemId}"]`,
    );
    const unavailableCard = page.locator(
      `article[data-item-id="${unavailableItemId}"]`,
    );
    const videoCard = page.locator(`article[data-item-id="${videoItemId}"]`);
    await expect(retainedCard).toBeVisible({ timeout: 15_000 });
    await expect(unavailableCard).toBeVisible();
    await expect(videoCard).toBeVisible();

    await prepareControlledShell(page);

    // Save without opening the reader. The mutation must retain its body.
    await retainedCard.getByRole("link").hover();
    await page.keyboard.press("s");
    await expect(retainedCard).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect
      .poll(() => getFeedBodyPersistence(page, retainedItemId))
      .toEqual({
        hasBody: true,
        isWatchLater: true,
        isWatched: false,
        retained: true,
      });

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeVisible({ timeout: 15_000 });

    const offlineUnavailableCard = page.locator(
      `article[data-item-id="${unavailableItemId}"]`,
    );
    const offlineVideoCard = page.locator(
      `article[data-item-id="${videoItemId}"]`,
    );
    for (const candidateCard of [offlineUnavailableCard, offlineVideoCard]) {
      await expect(candidateCard).toHaveClass(/opacity-50/);
      await expect(candidateCard.getByRole("link")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }

    // The selected-card shortcut cannot create an optimistic offline write.
    await offlineUnavailableCard.getByRole("link").hover();
    await page.keyboard.press("s");
    await expect
      .poll(() => getFeedBodyPersistence(page, unavailableItemId))
      .toMatchObject({ isWatchLater: false, retained: false });
    const offlineUrl = page.url();
    await offlineUnavailableCard.getByRole("link").click({ force: true });
    await expect(page).toHaveURL(offlineUrl);

    // Content-status filters stay local and enabled while disconnected.
    await page.getByRole("tab", { name: "Saved" }).click();
    const offlineRetainedCard = page.locator(
      `article[data-item-id="${retainedItemId}"]`,
    );
    await expect(offlineRetainedCard.getByRole("link")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await offlineRetainedCard.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/read/${retainedItemId}$`));
    await expect(page.getByText("Paragraph 1:")).toBeVisible();
    const archiveButton = page.getByRole("button", { name: "Archive" });
    await expect(archiveButton).toBeDisabled();
    await page.keyboard.press("e");
    await expect
      .poll(() => getFeedBodyPersistence(page, retainedItemId))
      .toMatchObject({ hasBody: true, isWatched: false, retained: true });

    await context.setOffline(false);
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeHidden({ timeout: 15_000 });
    await expect(archiveButton).toBeEnabled();
    await archiveButton.click();
    await expect(page.getByRole("button", { name: "Unarchive" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect
      .poll(() => getFeedBodyPersistence(page, retainedItemId))
      .toMatchObject({ hasBody: false, isWatched: true, retained: false });
  } finally {
    await context.setOffline(false);
    await cleanupUser(SELF_HOSTED_TURSO_PORT, email);
  }
});

test("reloads a retained Bookmark capture through the production service worker", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const { feedItemId, email, password } = await seedArticleData(
    SELF_HOSTED_TURSO_PORT,
    SELF_HOSTED_APP_PORT,
  );
  const { bookmarkId } = await seedBookmarkProjectionData(
    SELF_HOSTED_TURSO_PORT,
    email,
    feedItemId,
  );

  try {
    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();
    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toBeVisible({ timeout: 15_000 });
    await bookmarkCard.getByRole("link").click();
    await expect(page.getByText("Captured Bookmark body")).toBeVisible();
    await expect.poll(() => hasBookmarkCapture(page, bookmarkId)).toBe(true);
    await prepareControlledShell(page);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page).toHaveURL(new RegExp(`/read/${bookmarkId}$`));
    await expect(page.getByText("Captured Bookmark body")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toBeDisabled();
  } finally {
    await context.setOffline(false);
    await cleanupUser(SELF_HOSTED_TURSO_PORT, email);
  }
});

test("opens pre-saved content offline after passive hydration alone", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const { feedItemId, email, password } = await seedArticleData(
    SELF_HOSTED_TURSO_PORT,
    SELF_HOSTED_APP_PORT,
  );
  // Saved before the session starts, so only page-scoped hydration after the
  // view-matrix cells apply can retain the body and fetch the capture.
  await setFeedItemWatchLater(SELF_HOSTED_TURSO_PORT, feedItemId, true);
  const { bookmarkId } = await seedBookmarkProjectionData(
    SELF_HOSTED_TURSO_PORT,
    email,
    feedItemId,
  );

  try {
    await signIn({ page, email, password });
    await prepareControlledShell(page);

    // No interaction with either item: poll persistence until deferred
    // hydration lands, flushing the throttled IDB writer each attempt.
    await expect
      .poll(
        async () => {
          await page.evaluate(() =>
            window.dispatchEvent(new Event("pagehide")),
          );
          return getFeedBodyPersistence(page, feedItemId);
        },
        { timeout: 20_000 },
      )
      .toEqual({
        hasBody: true,
        isWatchLater: true,
        isWatched: false,
        retained: true,
      });
    await expect
      .poll(
        async () => {
          await page.evaluate(() =>
            window.dispatchEvent(new Event("pagehide")),
          );
          return hasBookmarkCapture(page, bookmarkId);
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: "Saved" }).click();
    const savedFeedCard = page.locator(`article[data-item-id="${feedItemId}"]`);
    await expect(savedFeedCard.getByRole("link")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await savedFeedCard.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/read/${feedItemId}$`));
    await expect(page.getByText("Paragraph 1:")).toBeVisible();

    await page.goBack();
    await expect(
      page.getByText("Offline, some features may be disabled"),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Saved" }).click();
    const savedBookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(savedBookmarkCard.getByRole("link")).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    await savedBookmarkCard.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/read/${bookmarkId}$`));
    await expect(page.getByText("Captured Bookmark body")).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await context.setOffline(false);
    await cleanupUser(SELF_HOSTED_TURSO_PORT, email);
  }
});
