import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedArticleData } from "../fixtures/seed-db";

test.describe("article progress tracking", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("saves and restores article progress", async ({ page }) => {
    const { feedItemId, email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    // Log in via the UI
    await signIn({ page, email, password });
    await expect(
      page.locator("article h3").filter({ hasText: "Test Article" }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Navigate to the article
    await page.goto(`/read/${feedItemId}`);
    await expect(
      page.locator("h1").filter({ hasText: "Test Article" }),
    ).toBeVisible({ timeout: 10000 });

    // Verify we start at the top
    const initialScrollY = await page.evaluate(() => window.scrollY);
    expect(initialScrollY).toBe(0);

    // Scroll down with mouse wheel to trigger progress tracking
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }

    // Wait for debounce (500ms) + buffer
    await page.waitForTimeout(800);

    // Verify we scrolled
    const scrolledY = await page.evaluate(() => window.scrollY);
    expect(scrolledY).toBeGreaterThan(0);

    // Capture the selected element's text so we can verify the *same*
    // element is reselected after restore (not just any element).
    const selectedElements = page.locator("[data-article-selected]");
    const selectionCount = await selectedElements.count();
    expect(selectionCount).toBeGreaterThan(0);
    const savedSelectionText = (
      await selectedElements.first().textContent()
    )?.trim();
    expect(savedSelectionText).toBeTruthy();

    // Navigate to home
    await page.goto("/");
    await expect(
      page.locator("article h3").filter({ hasText: "Test Article" }).first(),
    ).toBeVisible({ timeout: 15000 });

    // Navigate back to the article
    await page.goto(`/read/${feedItemId}`);
    await expect(
      page.locator("h1").filter({ hasText: "Test Article" }),
    ).toBeVisible({ timeout: 10000 });

    // Wait for progress restore
    await page.waitForTimeout(500);

    // Verify the page scrolled to the saved position (within a small
    // tolerance — restoration scrolls to the saved selected element, which
    // may not land at the exact pixel offset).
    const restoredScrollY = await page.evaluate(() => window.scrollY);
    expect(restoredScrollY).toBeGreaterThan(0);
    expect(Math.abs(restoredScrollY - scrolledY)).toBeLessThan(200);

    // Verify the *same* element is selected after restore
    const restoredSelected = page.locator("[data-article-selected]");
    expect(await restoredSelected.count()).toBeGreaterThan(0);
    const restoredSelectionText = (
      await restoredSelected.first().textContent()
    )?.trim();
    expect(restoredSelectionText).toBe(savedSelectionText);
  });
});
