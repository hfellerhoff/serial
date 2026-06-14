import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedArticleData,
  seedMultipleArticleData,
} from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("feed item actions", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("mark as read on read page and verify on home page", async ({
    page,
  }) => {
    test.setTimeout(30000);

    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await signIn({ page, email, password });

    // Wait for home page to fully load items
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // Navigate to the article read page
    await page.goto(`/read/${feedItemId}`);
    await expect(
      page.locator("h1").filter({ hasText: "Test Article" }),
    ).toBeVisible({ timeout: 10000 });

    // ── Mark as Read ───────────────────────────────────────────────
    await page.keyboard.press("e");
    await page.waitForTimeout(500);

    // ── Navigate back home with 'h' shortcut ───────────────────────
    await page.keyboard.press("h");
    await page.waitForTimeout(500);
    await expect(page).toHaveURL("/", { timeout: 10000 });

    // Switch to "read" filter with the "i" shortcut
    await page.keyboard.press("y");
    await page.waitForTimeout(500);

    // Article should appear in the read filter.
    const readArticle = page
      .locator(`article[data-item-id="${feedItemId}"]`)
      .first();
    await expect(readArticle).toBeVisible({ timeout: 10000 });
  });

  test("read toggle shortcuts advance after marking items unread in read filter", async ({
    page,
  }) => {
    test.setTimeout(30000);

    const { email, password } = await seedMultipleArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      3,
    );
    testEmail = email;

    const itemLink = (itemId: string) =>
      page.locator(`article[data-item-id="${itemId}"] a`).first();
    const selectedItemClass = /md:bg-muted/;

    await signIn({ page, email, password });

    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    await page.keyboard.press("Shift+F");
    await expect(
      page.locator("text=/Marked.*item.*as read/i").first(),
    ).toBeVisible({ timeout: 5000 });

    await page.keyboard.press("y");
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 10000,
    });

    const readItemIds = await page
      .locator("article")
      .evaluateAll((articles) =>
        articles
          .map((article) => article.getAttribute("data-item-id"))
          .filter((itemId): itemId is string => itemId !== null),
      );
    const [firstReadItemId, secondReadItemId, thirdReadItemId] = readItemIds;
    if (!firstReadItemId || !secondReadItemId || !thirdReadItemId) {
      throw new Error("Expected three read feed items");
    }

    await itemLink(firstReadItemId).hover();
    await expect(itemLink(firstReadItemId)).toHaveClass(selectedItemClass, {
      timeout: 5000,
    });

    await page.keyboard.press("e");
    await expect(itemLink(secondReadItemId)).toHaveClass(selectedItemClass, {
      timeout: 5000,
    });

    await page.keyboard.press("Space");
    await expect(itemLink(thirdReadItemId)).toHaveClass(selectedItemClass, {
      timeout: 5000,
    });
  });
});
