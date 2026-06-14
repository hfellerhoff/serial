import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedMultipleArticleData } from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("undo mark visible as read", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("clicking undo button restores unread items", async ({ page }) => {
    test.setTimeout(30000);

    const { email, password } = await seedMultipleArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      2,
    );
    testEmail = email;

    await signIn({ page, email, password });

    // Wait for home page to fully load items
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // Verify the first article is visible
    const firstArticle = page
      .locator("article")
      .filter({ hasText: "Test Article 1" })
      .first();
    await expect(firstArticle).toBeVisible();

    // Click "Mark all as read" button
    const markReadButton = page.getByRole("button", {
      name: /mark all as read/i,
    });
    await expect(markReadButton).toBeVisible();
    await markReadButton.click();

    // Wait for undo toast to appear
    const undoToast = page.locator("text=/Marked.*item.*as read/i").first();
    await expect(undoToast).toBeVisible({ timeout: 5000 });

    // Click the Undo button in the toast
    await page.getByRole("button", { name: /undo/i }).click();

    // Verify the article is back in the unread list
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
  });

  test("pressing z restores unread items", async ({ page }) => {
    test.setTimeout(30000);

    const { email, password } = await seedMultipleArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      2,
    );
    testEmail = email;

    await signIn({ page, email, password });

    // Wait for home page to fully load items
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // Verify the first article is visible
    const firstArticle = page
      .locator("article")
      .filter({ hasText: "Test Article 1" })
      .first();
    await expect(firstArticle).toBeVisible();

    // Use the "Shift+F" keyboard shortcut to mark visible as read
    await page.keyboard.press("Shift+F");

    // Wait for undo toast to appear
    const undoToast = page.locator("text=/Marked.*item.*as read/i").first();
    await expect(undoToast).toBeVisible({ timeout: 5000 });

    // Press 'z' to undo
    await page.keyboard.press("z");
    await page.waitForTimeout(500);

    // Verify the article is back in the unread list
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
  });
});
