import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedArticleData } from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("view-feed direct assignment CRUD", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("create view with direct feed, verify badge on feeds page, edit and remove", async ({
    page,
  }) => {
    test.setTimeout(120000);

    // ── 1. Seed a user with a feed and article ──────────────────────
    const { email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_RSS_SERVER_PORT,
    );
    testEmail = email;

    await signIn({ page, email, password });

    // Wait for app to load with feed data
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // ── 2. Create a View with a directly assigned feed ──────────────
    // The sidebar's add-view button may be outside viewport; use JS click
    const viewsSection = page.locator('[data-sidebar="group"]').filter({
      hasText: "Views",
    });
    await expect(viewsSection).toBeVisible({ timeout: 10000 });
    // The group label has two menu buttons: the gear icon (links to /views)
    // and the plus icon (opens the Add View dialog). Pick the plus button.
    const addViewBtn = viewsSection
      .locator('[data-sidebar="group-label"] [data-sidebar="menu-button"]')
      .nth(1);
    await addViewBtn.evaluate((el: HTMLElement) => el.click());

    // Wait for Add View dialog
    const addViewDialog = page.locator('[role="dialog"]');
    await expect(
      addViewDialog.getByRole("heading", { name: "Add View" }),
    ).toBeVisible({
      timeout: 5000,
    });

    // Name the view
    await addViewDialog
      .locator('input[placeholder="My View"]')
      .pressSequentially("Test Direct View", { delay: 30 });

    // Open the Feeds combobox (click the "+" icon button next to "Feeds" label)
    const feedsLabel = addViewDialog.getByText("Feeds", { exact: true });
    await expect(feedsLabel).toBeVisible({ timeout: 3000 });
    const feedsPlusBtn = feedsLabel.locator("..").locator("button").first();
    await feedsPlusBtn.click();
    await page.waitForTimeout(500);

    // Select the first feed option in the combobox dropdown
    const feedOption = page.getByRole("option").first();
    await expect(feedOption).toBeVisible({ timeout: 3000 });
    await feedOption.click({ force: true });
    await page.waitForTimeout(300);

    // Close the popover by clicking dialog title
    await addViewDialog.getByRole("heading", { name: "Add View" }).click();

    // Submit the view
    await addViewDialog.getByRole("button", { name: /add view/i }).click();
    await expect(page.getByText("View added!")).toBeVisible({ timeout: 10000 });

    // ── 3. Verify the view appears in sidebar ───────────────────────
    await expect(
      page
        .locator('[data-sidebar="group"]')
        .filter({ hasText: "Views" })
        .getByText("Test Direct View"),
    ).toBeVisible({ timeout: 10000 });

    // ── 4. Go to /feeds and verify the view badge ───────────────────
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({
      timeout: 10000,
    });

    // The feed should show "Test Direct View" as a badge in the feed row
    await expect(
      page.locator("main").locator('[data-slot="badge"]').filter({
        hasText: "Test Direct View",
      }),
    ).toBeVisible({ timeout: 10000 });

    // ── 5. Select feed and use Edit Views bulk action ───────────────
    // Click the feed row to select it
    const feedRow = page
      .locator("button[type='button']")
      .filter({ hasText: "Test Blog" });
    await feedRow.click();

    // Click "Edit" button in the action bar
    const editBtn = page.getByRole("button", { name: /\bedit\b/i });
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // The Edit Feeds dialog should appear
    const editDialog = page.locator('[role="dialog"]');
    await expect(editDialog.getByText("Edit Feeds")).toBeVisible({
      timeout: 5000,
    });

    // "Test Direct View" should already be selected (shown as a chip)
    const viewChip = editDialog
      .locator('[data-slot="badge"]')
      .filter({ hasText: "Test Direct View" });
    await expect(viewChip).toBeVisible({ timeout: 3000 });

    // ── 6. Remove the view assignment via the chip's inline X button ─
    await viewChip.locator("button").click();
    await expect(viewChip).toHaveCount(0);

    // Save the change
    await editDialog.getByRole("button", { name: /save/i }).click();

    // Dialog should close
    await expect(
      editDialog.getByRole("heading", { name: "Edit Feeds" }),
    ).toBeHidden({ timeout: 5000 });

    // ── 7. Verify the badge is gone from /feeds ─────────────────────
    // Re-render by reloading so we don't depend on cache invalidation timing
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.locator("main").locator('[data-slot="badge"]').filter({
        hasText: "Test Direct View",
      }),
    ).toHaveCount(0, { timeout: 10000 });

    // The view itself should still exist in the sidebar (we removed the
    // feed-from-view assignment, not the view).
    await expect(
      page
        .locator('[data-sidebar="group"]')
        .filter({ hasText: "Views" })
        .getByText("Test Direct View"),
    ).toBeVisible({ timeout: 5000 });
  });
});
