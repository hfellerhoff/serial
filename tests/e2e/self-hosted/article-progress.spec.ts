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

    // The scrollable container is the SidebarInset <main> element, not the
    // window (it has overflow-y: auto).
    const scrollContainer = page.locator('[data-slot="sidebar-inset"]');

    // Verify we start at the top
    const initialScrollTop = await scrollContainer.evaluate(
      (el) => el.scrollTop,
    );
    expect(initialScrollTop).toBe(0);

    // Scroll down using mouse wheel events to trigger progress tracking.
    // The wheel handler in useArticleNavigation listens on window, so
    // page.mouse.wheel dispatches the right events — it now works because
    // the scroll container is the SidebarInset element, not the window.
    // We hover over the scroll container first so the wheel events land on it.
    const box = await scrollContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    // Allow scroll event handlers and debounce (500ms) + buffer
    await page.waitForTimeout(1000);

    // Verify we scrolled
    const scrolledTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrolledTop).toBeGreaterThan(0);

    // Capture the selected element's text so we can verify the *same*
    // element is reselected after restore (not just any element).
    const selectedElements = page.locator("[data-article-selected]");
    const selectionCount = await selectedElements.count();
    expect(selectionCount).toBeGreaterThan(0);
    const savedSelectionText = (
      await selectedElements.first().textContent()
    )?.trim();
    expect(savedSelectionText).toBeTruthy();

    // Reload the page to test that progress persists across page loads.
    await page.reload({ waitUntil: "load" });
    await expect(
      page.locator("h1").filter({ hasText: "Test Article" }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for article body content to render (paragraphs arrive via SSE
    // after the full page reload — IDB rehydration + server diff).
    await expect(
      page.locator('[data-slot="sidebar-inset"] p').first(),
    ).toBeVisible({ timeout: 15000 });

    // Wait for progress restoration — the element with data-article-selected
    // appears once the restoration effect fires and selects the saved element.
    const restoredSelected = page.locator("[data-article-selected]");
    await expect(restoredSelected.first()).toBeVisible({ timeout: 10000 });

    // Wait for SSE processing to settle so the scroll position is stable.
    await page.waitForTimeout(2000);

    // Verify the page scrolled to the saved position
    const restoredScrollTop = await scrollContainer.evaluate(
      (el) => el.scrollTop,
    );
    expect(restoredScrollTop).toBeGreaterThan(0);

    // Verify the *same* element is selected after restore
    expect(await restoredSelected.count()).toBeGreaterThan(0);
    const restoredSelectionText = (
      await restoredSelected.first().textContent()
    )?.trim();
    expect(restoredSelectionText).toBe(savedSelectionText);
  });
});
