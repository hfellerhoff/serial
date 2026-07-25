import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedArticleData,
  seedMultipleArticleData,
  setFeedItemAsYouTubeVideo,
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

  test("copies the selected item URL and shows the shortcut overlay", async ({
    context,
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: `http://localhost:${SELF_HOSTED_APP_PORT}`,
    });
    await signIn({ page, email, password });

    const article = page.locator(`article[data-item-id="${feedItemId}"]`);
    await expect(article).toBeVisible({ timeout: 30000 });
    await article.hover();

    const copyButton = article.getByRole("button", { name: "Copy item URL" });
    await page.keyboard.down("Alt");
    await expect(copyButton.locator("kbd")).toHaveText("Shift+C");
    await page.keyboard.up("Alt");

    await page.keyboard.press("Shift+C");
    await expect(page.getByText("Link copied")).toBeVisible();

    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    const itemUrlSuffix = feedItemId.replace(/^article-/, "");
    expect(copiedUrl).toBe(
      `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/test-blog/${itemUrlSuffix}`,
    );
  });

  test("shows Copy URL before Open in the video header", async ({ page }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;

    await signIn({ page, email, password });
    await page.goto(`/watch/${feedItemId}`);

    const headerActions = page.locator("header > span").last();
    const buttons = headerActions.getByRole("button");
    await expect(buttons.first()).toHaveAccessibleName("Copy URL");
    await expect(buttons).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Copy URL" })).toHaveCount(1);
  });

  test("loads the YouTube player with an identifiable embed context", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    await setFeedItemAsYouTubeVideo(
      SELF_HOSTED_TURSO_PORT,
      feedItemId,
      "M7lc1UVf-VE",
    );

    await page.addInitScript(() => {
      localStorage.setItem(
        "serial-flag-custom-video-player",
        JSON.stringify("youtube"),
      );
    });
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.abort(),
    );
    await signIn({ page, email, password });
    await page.goto(`/watch/${feedItemId}`);

    const player = page.getByTitle("YouTube video player");
    await expect(player).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE",
    );
    await expect(player).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
    await expect(player).not.toHaveAttribute("sandbox", /.*/);
  });

  test("marking a saved item read keeps it selected", async ({ page }) => {
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

    const unreadItemIds = await page
      .locator("article")
      .evaluateAll((articles) =>
        articles
          .map((article) => article.getAttribute("data-item-id"))
          .filter((itemId): itemId is string => itemId !== null),
      );
    const [firstUnreadItemId] = unreadItemIds;
    if (!firstUnreadItemId) {
      throw new Error("Expected an unread feed item");
    }

    await itemLink(firstUnreadItemId).hover();
    await page.keyboard.press("s");

    await page.keyboard.press("b");
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 10000,
    });

    const savedItemIds = await page
      .locator("article")
      .evaluateAll((articles) =>
        articles
          .map((article) => article.getAttribute("data-item-id"))
          .filter((itemId): itemId is string => itemId !== null),
      );
    const [firstSavedItemId] = savedItemIds;
    if (!firstSavedItemId) {
      throw new Error("Expected a saved feed item");
    }

    // Exit keyboard-navigation mode before selecting by hover.
    await page.mouse.move(1, 1);
    await page.mouse.move(10, 10);
    await itemLink(firstSavedItemId).hover();
    await expect(itemLink(firstSavedItemId)).toHaveClass(selectedItemClass, {
      timeout: 5000,
    });

    await page.keyboard.press("e");
    await expect(itemLink(firstSavedItemId)).toHaveClass(selectedItemClass, {
      timeout: 5000,
    });
  });
});
