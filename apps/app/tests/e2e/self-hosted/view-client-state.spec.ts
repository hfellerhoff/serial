import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  getFeedItemWatchLaterState,
  seedMixedViewSectionCase,
} from "../fixtures/seed-db";

test.describe("sectioned View client state", () => {
  let testEmail = "";

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("removes a saved feed item from a loaded unread View", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const fixture = await seedMixedViewSectionCase(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      {
        feedSectionFeedItem: false,
        tagSectionFeedItem: true,
        tagSectionBookmark: false,
        uncategorizedFeedItem: false,
        uncategorizedBookmark: false,
      },
      "unread",
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });
    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    await feedMain
      .getByRole("radio", { name: fixture.viewName, exact: true })
      .click();

    const itemId = fixture.items.tagSectionFeedItem;
    const item = feedMain.locator(`article[data-item-id="${itemId}"]`);
    await expect(item).toBeVisible({ timeout: 30_000 });

    await item.getByRole("link").hover();
    await page.keyboard.press("s");

    await expect(item).toHaveCount(0, { timeout: 5_000 });
    await expect
      .poll(() => getFeedItemWatchLaterState(SELF_HOSTED_TURSO_PORT, itemId))
      .toBe(true);
  });
});
