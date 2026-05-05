import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedArticleData } from "../fixtures/seed-db";
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
    test.setTimeout(120000);

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
    await page.keyboard.press("i");
    await page.waitForTimeout(500);

    // Article should appear and have reduced opacity
    const readArticle = page.locator("article").first();
    await expect(readArticle).toBeVisible({ timeout: 10000 });
    await expect(readArticle).toHaveClass(/opacity-50/, { timeout: 5000 });
  });
});
