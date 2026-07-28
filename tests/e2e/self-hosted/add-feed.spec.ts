import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedAddFeedSelectionData,
  seedArticleData,
} from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";
import type { Locator } from "@playwright/test";

async function expectVerticalPosition(
  container: Locator,
  content: Locator,
  position: number,
) {
  await expect
    .poll(async () => {
      const [containerBox, contentBox] = await Promise.all([
        container.boundingBox(),
        content.boundingBox(),
      ]);
      if (!containerBox || !contentBox) return Number.POSITIVE_INFINITY;

      const verticalOffset = Math.abs(
        contentBox.y +
          contentBox.height / 2 -
          (containerBox.y + containerBox.height * position),
      );
      const topOverflow = Math.max(containerBox.y - contentBox.y, 0);
      const bottomOverflow = Math.max(
        contentBox.y +
          contentBox.height -
          (containerBox.y + containerBox.height),
        0,
      );

      return Math.max(verticalOffset, topOverflow, bottomOverflow);
    })
    // Viewport changes settle asynchronously, and fractional viewport units
    // and font metrics can differ by a subpixel once rendering is stable.
    .toBeLessThanOrEqual(3);
}

test.describe("add feed manually", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("add a single feed by URL and verify it appears", async ({ page }) => {
    test.setTimeout(30000);

    const { email, password } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_RSS_SERVER_PORT,
    );
    testEmail = email;
    await seedAddFeedSelectionData(SELF_HOSTED_TURSO_PORT, email);

    await signIn({ page, email, password });
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    const manageHeaderButton = page.getByRole("button", {
      name: "Manage",
      exact: true,
    });
    await expect(manageHeaderButton).toBeVisible();

    // Open the Add Feed dialog with the "a" keyboard shortcut
    await page.keyboard.press("a");
    await page.waitForTimeout(300);

    // Discovery opens as a standalone command palette.
    const dialog = page.locator('[role="dialog"]');
    await expect(
      dialog.getByPlaceholder("Paste a URL or search for a feed..."),
    ).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole("heading", { name: "Add Feed" })).toHaveCount(
      0,
    );
    await expect(
      dialog.getByText("Enter a website, channel, or RSS feed URL."),
    ).toBeVisible();
    await expect(
      dialog
        .getByText("Enter a website, channel, or RSS feed URL.")
        .locator("xpath=preceding-sibling::*[name()='svg']"),
    ).toBeVisible();
    await expect(dialog.getByText("Bulk Import")).toHaveCount(0);

    const commandList = dialog.locator("[cmdk-list]");
    await expect(commandList).toHaveCSS("min-height", "320px");

    // On desktop, the command palette sits one-third down the viewport.
    const desktopDialogBox = await dialog.boundingBox();
    expect(desktopDialogBox).not.toBeNull();
    expect(desktopDialogBox!.y + desktopDialogBox!.height / 2).toBeCloseTo(
      1080 / 3,
      0,
    );

    // The command palette fills the visual viewport on mobile.
    await page.setViewportSize({ width: 390, height: 500 });
    await expect(dialog).toHaveCSS("width", "390px");
    await expect(dialog).toHaveCSS("height", "500px");
    const emptyState = dialog.getByTestId("feed-discovery-empty-state");
    await expectVerticalPosition(commandList, emptyState, 1 / 3);
    const mobileDialogBox = await dialog.boundingBox();
    expect(mobileDialogBox).toMatchObject({
      x: 0,
      y: 0,
      width: 390,
      height: 500,
    });
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();

    // Exercise the reduced visual height produced by a mobile keyboard. The
    // palette follows it, and the empty state remains centered and visible.
    await page.setViewportSize({ width: 390, height: 300 });
    await expect(dialog).toHaveCSS("height", "300px");
    await expectVerticalPosition(commandList, emptyState, 1 / 3);
    await page.setViewportSize({ width: 390, height: 500 });

    // Short desktop viewports remain entirely on-screen.
    await page.setViewportSize({ width: 1920, height: 400 });
    const shortViewportDialogBox = await dialog.boundingBox();
    expect(shortViewportDialogBox?.y).toBeGreaterThanOrEqual(0);
    expect(
      (shortViewportDialogBox?.y ?? 0) + (shortViewportDialogBox?.height ?? 0),
    ).toBeLessThanOrEqual(400);
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Enter the RSS server URL for the "cgp-grey" feed
    const feedUrl = `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/feed/cgp-grey`;
    const feedSearch = dialog.getByPlaceholder(
      "Paste a URL or search for a feed...",
    );
    await expect(feedSearch).toHaveCSS("height", "56px");
    await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveClass(
      /bg-black\/40/,
    );
    await feedSearch.fill(
      `http://127.0.0.1:${SELF_HOSTED_RSS_SERVER_PORT}/missing-feed`,
    );
    const noFeedsFound = dialog.getByText("No feeds found for URL.");
    await expect(noFeedsFound).toBeVisible({ timeout: 10000 });
    await expect(
      noFeedsFound.locator("xpath=preceding-sibling::*[name()='svg']"),
    ).toBeVisible();
    const failureState = dialog.getByTestId("feed-discovery-failure-state");
    await expectVerticalPosition(commandList, failureState, 1 / 2);

    await page.setViewportSize({ width: 390, height: 300 });
    await expect(dialog).toHaveCSS("height", "300px");
    await expectVerticalPosition(commandList, failureState, 1 / 3);
    await page.setViewportSize({ width: 1920, height: 1080 });

    await expect(dialog.getByText(/Find feeds at/)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry" }).click();
    await expect(
      dialog.getByRole("option", { name: "Finding feeds…" }),
    ).toBeVisible();
    await expect(noFeedsFound).toBeVisible({ timeout: 10000 });

    await feedSearch.fill(feedUrl);
    await expect(
      dialog.getByRole("option", { name: "Finding feeds…" }),
    ).toBeVisible();

    // A recognized URL is discovered automatically after a short debounce.
    // Even a single result requires an explicit selection.
    const discoveredFeed = dialog.getByRole("option", {
      name: /CGP Grey/,
    });
    await expect(discoveredFeed).toBeVisible({ timeout: 10000 });
    await expect(discoveredFeed).toHaveAttribute("data-selected", "true");

    // Editing the discovered URL clears its results. Returning to that same
    // normalized URL should run discovery again instead of remaining idle.
    await feedSearch.fill("not a feed url");
    await expect(discoveredFeed).toHaveCount(0);
    await feedSearch.fill(feedUrl);
    await expect(
      dialog.getByRole("option", { name: "Finding feeds…" }),
    ).toBeVisible();
    await expect(discoveredFeed).toBeVisible({ timeout: 10000 });

    await expect(feedSearch).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("option", { name: "Adding feed…" }),
    ).toBeVisible();

    // Selecting a result creates it, then opens its Edit Feed modal.
    await expect(
      dialog.getByRole("heading", { name: "Edit Feed" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Feed added!")).toBeVisible({
      timeout: 10000,
    });
    await expect(dialog.getByRole("heading", { name: "Add Feed" })).toHaveCount(
      0,
    );
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
      "CGP Grey",
    );
    await expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();

    const viewsField = dialog.locator(
      '[data-slot="selectable-chip-list"][data-label="Views"]',
    );
    const viewChips = viewsField.locator("button[aria-pressed]");
    await expect(viewChips).toHaveText(["All", "Alpha View", "Zebra View"]);
    await viewsField.getByRole("button", { name: "Create view" }).click();
    const newViewNameInput = page.getByPlaceholder("New view name...");
    await newViewNameInput.fill("Inline View");
    await page
      .getByRole("option", { name: 'Create view "Inline View"' })
      .click();
    await expect(viewChips.filter({ hasText: "Inline View" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await viewChips.filter({ hasText: "Zebra View" }).click();
    await expect(viewChips.filter({ hasText: "Zebra View" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const tagsField = dialog.locator(
      '[data-slot="selectable-chip-list"][data-label="Tags"]',
    );
    const tagChips = tagsField.locator("button[aria-pressed]");
    await expect(tagChips).toHaveText(["Priority", "Alpha", "Zebra"]);
    await tagsField.getByRole("button", { name: "Create tag" }).click();
    const newTagNameInput = page.getByPlaceholder("New tag name...");
    await newTagNameInput.fill("Inline Tag");
    await page.getByRole("option", { name: 'Create tag "Inline Tag"' }).click();
    await expect(tagChips.filter({ hasText: "Inline Tag" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await tagChips.filter({ hasText: "Priority" }).click();
    await expect(tagChips.filter({ hasText: "Priority" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Save the optional organization changes in Edit Feed.
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Feed updated!")).toBeVisible();

    // Verify the feed appears in the sidebar
    const feedsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });
    await expect(
      feedsSection.getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible({ timeout: 10000 });

    // Verify the feed appears on /feeds
    await page.goto("/feeds");
    await expect(
      page.getByRole("tab", { name: /feeds/i, selected: true }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.locator("main").getByRole("button", { name: "CGP Grey" }),
    ).toBeVisible({ timeout: 10000 });
    const feedRow = page
      .locator("main")
      .getByRole("button", { name: "CGP Grey" })
      .locator("..");
    await expect(feedRow.getByText("Inline View")).toBeVisible();
    await expect(feedRow.getByText("Inline Tag")).toBeVisible();
  });
});
