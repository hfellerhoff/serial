import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  getFeedItemProgress,
  seedArticleData,
  setFeedItemContent,
} from "../fixtures/seed-db";

test.describe("article progress tracking", () => {
  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("saves progress but opens the article at the top", async ({ page }) => {
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
    // We hover over the scroll container first so the wheel events land on it.
    const box = await scrollContainer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    }
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    // Verify we scrolled
    const scrolledTop = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(scrolledTop).toBeGreaterThan(0);

    // Mouse scrolling tracks progress without activating keyboard selection.
    await page.waitForTimeout(250);
    const selectedElements = page.locator("[data-article-selected]");
    await expect(selectedElements).toHaveCount(0);

    // Wait for the debounced mutation to reach the server before reloading.
    await expect
      .poll(() => getFeedItemProgress(SELF_HOSTED_TURSO_PORT, feedItemId))
      .toBeGreaterThan(0);

    // Saving progress updates feedItem, but must not trigger entry restoration
    // and reposition a user who has already interacted with the article.
    await expect
      .poll(() => scrollContainer.evaluate((el) => el.scrollTop))
      .toBe(scrolledTop);

    // Reloading should not move the reader back to the saved position.
    await page.reload({ waitUntil: "load" });
    await expect(
      page.locator("h1").filter({ hasText: "Test Article" }),
    ).toBeVisible({ timeout: 15000 });

    // Wait for article body content to render after IDB hydration/server sync.
    await expect(
      page.locator('[data-slot="sidebar-inset"] p').first(),
    ).toBeVisible({ timeout: 15000 });

    // Give router restoration and the server refresh time to settle; neither
    // should reapply the saved paragraph position.
    await page.waitForTimeout(1000);
    expect(await scrollContainer.evaluate((el) => el.scrollTop)).toBe(0);

    // Opening at the top also leaves keyboard selection inactive.
    await expect(selectedElements).toHaveCount(0);

    await page.keyboard.press("ArrowDown");
    await expect(selectedElements).toHaveCount(1);
  });

  test("opens a fresh article at the top after client navigation", async ({
    page,
  }) => {
    const { email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await signIn({ page, email, password });
    const articleCard = page
      .locator("article")
      .filter({ hasText: "Test Article" });
    await expect(articleCard).toBeVisible();

    const scrollContainer = page.locator('[data-slot="sidebar-inset"]');
    await scrollContainer.evaluate((element) => {
      const spacer = document.createElement("div");
      spacer.style.height = "3000px";
      spacer.style.flexShrink = "0";
      element.append(spacer);
      element.scrollTop = 2000;
    });
    expect(await scrollContainer.evaluate((element) => element.scrollTop)).toBe(
      2000,
    );

    await articleCard.getByRole("link").first().click();
    await expect(page).toHaveURL(/\/read\//);
    await expect(page.getByText("Paragraph 1:")).toBeVisible();
    await page.waitForTimeout(1000);

    expect(await scrollContainer.evaluate((element) => element.scrollTop)).toBe(
      0,
    );
  });

  test("navigates through content inside top-level div wrappers", async ({
    page,
  }) => {
    const { feedItemId, email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await setFeedItemContent(
      SELF_HOSTED_TURSO_PORT,
      feedItemId,
      `
        <div class="feed-wrapper">
          <p>First wrapped paragraph</p>
          <div><p>Second nested paragraph</p></div>
          <ul><li>Wrapped list item</li></ul>
          <div>Leaf callout</div>
          <div data-article-video-embed><p>Video internals</p></div>
        </div>
      `,
    );

    await signIn({ page, email, password });
    await page.goto(`/read/${feedItemId}`);
    await expect(page.getByText("First wrapped paragraph")).toBeVisible();

    const selectedElement = page.locator("[data-article-selected]");
    const expectedSelections = [
      ["P", "First wrapped paragraph"],
      ["P", "Second nested paragraph"],
      ["LI", "Wrapped list item"],
      ["DIV", "Leaf callout"],
      ["DIV", "Video internals"],
    ] as const;

    for (const [tagName, text] of expectedSelections) {
      await page.keyboard.press("ArrowDown");
      await expect(selectedElement).toHaveCount(1);
      await expect(selectedElement).toHaveJSProperty("tagName", tagName);
      await expect(selectedElement).toContainText(text);
    }
  });

  test("opens a selected article image with Space", async ({ page }) => {
    const { feedItemId, email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await setFeedItemContent(
      SELF_HOSTED_TURSO_PORT,
      feedItemId,
      '<img src="/icon-192x192.png" alt="Keyboard preview">',
    );

    await signIn({ page, email, password });
    await page.goto(`/read/${feedItemId}`);
    await expect(page.getByAltText("Keyboard preview")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Open image preview: Keyboard preview",
      }),
    ).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await expect(page.locator("[data-lightbox]")).toHaveAttribute(
      "data-article-selected",
      "true",
    );

    await page.keyboard.press("Space");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
