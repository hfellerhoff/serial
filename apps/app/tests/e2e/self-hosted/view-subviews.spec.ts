import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_RSS_SERVER_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import { cleanupUser, seedViewLayoutData } from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";
import { openSidebar } from "../fixtures/sidebar";
import type { Locator } from "@playwright/test";

test.describe("view subview sections", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) {
      await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
    }
  });

  test("create view with feeds and tags, configure layout sections, verify rendering and keyboard navigation", async ({
    page,
  }) => {
    test.setTimeout(45000);

    // ── 1. Seed user with 3 feeds, 2 tags, and articles ─────────────
    const { email, password, feedItemIds } = await seedViewLayoutData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_RSS_SERVER_PORT,
    );
    testEmail = email;
    const viewName = "Layout Test View";
    const expectedFeedItemIdsBySection = {
      techFeed: feedItemIds.slice(0, 15),
      newsFeed: feedItemIds.slice(15, 30),
      techTag: feedItemIds.slice(30, 45),
    };

    await signIn({ page, email, password });
    await expect(page.locator("article").first()).toBeVisible({
      timeout: 30000,
    });

    // ── 2. Create a view with all 3 feeds and 2 tags ───────────────
    await openSidebar(page);
    const viewsSection = page.locator('[data-sidebar="group"]').filter({
      hasText: "Views",
    });
    await expect(viewsSection).toBeVisible({ timeout: 10000 });
    const addViewBtn = viewsSection
      .locator('[data-sidebar="group-label"] [data-sidebar="menu-button"]')
      .nth(1);
    await addViewBtn.evaluate((el: HTMLElement) => el.click());

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog.getByRole("heading", { name: "Add View" })).toBeVisible(
      { timeout: 5000 },
    );

    await dialog
      .locator('input[placeholder="My View"]')
      .pressSequentially(viewName, { delay: 30 });

    const addComboboxOption = async ({
      label,
      placeholder,
      optionName,
    }: {
      label: string;
      placeholder: string;
      optionName: string;
    }) => {
      const fieldLabel = dialog.getByText(label, { exact: true });
      await expect(fieldLabel).toBeVisible({ timeout: 3000 });
      const addButton = fieldLabel.locator("..").getByRole("button").first();

      await addButton.click();
      const searchInput = page
        .getByPlaceholder(placeholder)
        .filter({ visible: true });
      await expect(searchInput).toBeVisible({ timeout: 3000 });
      await searchInput.fill(optionName);

      const combobox = searchInput.locator("xpath=ancestor::*[@cmdk-root]");
      const option = combobox.getByRole("option", {
        name: optionName,
        exact: true,
      });
      await expect(option).toBeVisible({ timeout: 3000 });
      await option.click();
      await page.keyboard.press("Escape");
    };

    const feedNames = ["Tech Feed", "News Feed", "Mixed Feed"];
    for (const feedName of feedNames) {
      await addComboboxOption({
        label: "Feeds",
        placeholder: "Search feeds...",
        optionName: feedName,
      });
    }

    const tagNames = ["Tech", "News"];
    for (const tagName of tagNames) {
      await addComboboxOption({
        label: "Tags",
        placeholder: "Search tags...",
        optionName: tagName,
      });
    }

    // ── 3. Switch to Display tab ─────────────────────────────────────
    const displayTab = dialog.getByRole("tab", { name: "Display" });
    await displayTab.click();
    await expect(displayTab).toHaveAttribute("data-state", "active");

    // ── 4. Add 2 feeds and 1 tag to the display ───────────────────────
    // The add-section button is an icon button next to the "View sections" label
    const viewSectionsLabel = dialog.getByText("View sections", {
      exact: true,
    });
    await expect(viewSectionsLabel).toBeVisible({ timeout: 3000 });
    const addSubviewBtn = viewSectionsLabel
      .locator("..")
      .getByRole("button")
      .first();
    await expect(addSubviewBtn).toBeVisible({ timeout: 3000 });

    await addSubviewBtn.click();
    const allTagsSearchInput = page
      .getByPlaceholder("Search feeds or tags...")
      .filter({ visible: true });
    await allTagsSearchInput.fill("Unassigned Tag");
    await expect(
      allTagsSearchInput
        .locator("xpath=ancestor::*[@cmdk-root]")
        .getByRole("option", { name: "#Unassigned Tag", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    const addViewSection = async (optionName: string) => {
      await addSubviewBtn.click();
      const searchInput = page
        .getByPlaceholder("Search feeds or tags...")
        .filter({ visible: true });
      await expect(searchInput).toBeVisible({ timeout: 3000 });
      await searchInput.fill(optionName);

      const combobox = searchInput.locator("xpath=ancestor::*[@cmdk-root]");
      const option = combobox.getByRole("option", {
        name: optionName,
        exact: true,
      });
      await expect(option).toBeVisible({ timeout: 3000 });
      await option.click();
    };

    await addViewSection("Tech Feed");
    await addViewSection("News Feed");
    await addViewSection("#Tech");

    // ── 5. Assign layouts ────────────────────────────────────────────
    const viewSectionRows = dialog.locator("[data-view-section-row]");
    await expect(viewSectionRows).toHaveCount(4, { timeout: 5000 }); // 3 view sections + Uncategorized

    const selectSectionLayout = async (
      row: Locator,
      currentLayoutName: string,
      nextLayoutName: string,
    ) => {
      await row
        .getByRole("button", { name: currentLayoutName, exact: true })
        .click();

      const layoutPopover = page
        .locator("[data-radix-popper-content-wrapper]")
        .filter({ visible: true })
        .last();
      await expect(layoutPopover).toBeVisible({ timeout: 3000 });
      await layoutPopover
        .getByRole("button", { name: nextLayoutName, exact: true })
        .click();
    };

    // 1st item (Tech Feed) -> Grid
    await selectSectionLayout(viewSectionRows.nth(0), "Default", "Grid");

    // 2nd item (News Feed) -> List
    await selectSectionLayout(viewSectionRows.nth(1), "Default", "List");

    // 3rd item (#Tech) -> List
    await selectSectionLayout(viewSectionRows.nth(2), "Default", "List");

    // Uncategorized -> Large List (already the inherited layout)

    // ── 6. Save the view ─────────────────────────────────────────────
    await dialog.getByRole("button", { name: /add view/i }).click();
    await expect(page.getByText("View added!")).toBeVisible({
      timeout: 10000,
    });

    // ── 7. Select the view from the filter chips ────────────────────
    const feedMain = page
      .locator("main")
      .filter({
        has: page.getByRole("heading", { name: "Serial", exact: true }),
      })
      .last();
    const viewFilterChip = feedMain
      .getByRole("button")
      .filter({ hasText: viewName })
      .first();

    await expect(async () => {
      const isChipVisible = await viewFilterChip.isVisible();
      const isViewRendered = await page
        .getByRole("heading", { name: "Tech Feed", exact: true })
        .isVisible();
      expect(isChipVisible || isViewRendered).toBe(true);
    }).toPass({ timeout: 10000 });

    if (await viewFilterChip.isVisible()) {
      const chipState = await viewFilterChip.getAttribute("data-state");
      if (chipState !== "on") {
        await viewFilterChip.click();
      }
    }

    // ── 8. Verify sectioned rendering ──────────────────────────────
    // Wait for items to render
    await page.waitForTimeout(1000);

    const sectionByHeading = (heading: string) =>
      page
        .getByRole("heading", { name: heading, exact: true })
        .locator("xpath=ancestor::div[starts-with(@id, 'section-')]");
    const sortedItemIds = (itemIds: string[]) => [...itemIds].sort();
    const getRenderedItemIds = async (items: Locator) =>
      (
        await items.evaluateAll((elements) =>
          elements.flatMap((element) => {
            const itemId = element.getAttribute("data-item-id");
            return itemId ? [itemId] : [];
          }),
        )
      ).sort();
    const getSelectedRenderedItemIds = async () =>
      page.locator("[data-item-id]").evaluateAll((elements) =>
        elements.flatMap((element) => {
          const itemId = element.getAttribute("data-item-id");
          const link = element.querySelector("a");
          const isSelected = link?.className.includes("md:bg-muted") ?? false;
          return itemId && isSelected ? [itemId] : [];
        }),
      );

    // Should see "Tech Feed" heading with large list layout items
    await expect(
      page.getByRole("heading", { name: "Tech Feed", exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // Should see "News Feed" heading
    await expect(
      page.getByRole("heading", { name: "News Feed", exact: true }),
    ).toBeVisible({ timeout: 10000 });

    // The first render window contains the two explicit feed sections. The
    // #Tech tag section only contains Mixed Feed items because explicit feed
    // sections claim Tech Feed and News Feed items first.
    await expect(
      page.getByRole("heading", { name: "Tech", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Uncategorized", exact: true }),
    ).toHaveCount(0);

    // ── 9. Verify keyboard navigation across sections ──────────────
    // Reset focus to body for keyboard shortcuts
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      document.body.focus();
    });
    await page.waitForTimeout(150);

    // A grid in one subsection must not make list navigation in another
    // subsection jump by the grid's column count.
    const newsSectionForNavigation = sectionByHeading("News Feed");
    const newsItemsForNavigation =
      newsSectionForNavigation.locator("[data-item-id]");
    const firstNewsItem = newsItemsForNavigation.nth(0);
    const secondNewsItem = newsItemsForNavigation.nth(1);
    const firstNewsItemId = await firstNewsItem.getAttribute("data-item-id");
    const secondNewsItemId = await secondNewsItem.getAttribute("data-item-id");
    expect(firstNewsItemId).not.toBeNull();
    expect(secondNewsItemId).not.toBeNull();

    await firstNewsItem.hover();
    await expect.poll(getSelectedRenderedItemIds).toEqual([firstNewsItemId!]);
    await page.keyboard.press("ArrowDown");
    await expect.poll(getSelectedRenderedItemIds).toEqual([secondNewsItemId!]);

    // ── 10. Verify pagination in sectioned views ─────────────────────
    // Count total visible items after initial load (should be 30)
    const initialItemCount = await page.locator("[data-item-id]").count();
    expect(initialItemCount).toBe(30);

    // Keep scrolling the app's actual scroll container to the very bottom until
    // the infinite-scroll sentinel intersects and expands the item window.
    await expect(async () => {
      await page.evaluate(() => {
        const scrollContainer = document.querySelector(
          '[data-slot="sidebar-inset"]',
        );
        if (scrollContainer instanceof HTMLElement) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
          return;
        }

        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      const count = await page.locator("[data-item-id]").count();
      expect(count).toBeGreaterThan(30);
    }).toPass({ intervals: [250, 500, 750, 1000], timeout: 15000 });

    const paginatedItemCount = await page.locator("[data-item-id]").count();
    expect(paginatedItemCount).toBe(45);

    // Critical: verify feed sections keep their own items after pagination.
    const techFeedSection = sectionByHeading("Tech Feed");
    const techFeedItems = techFeedSection.locator("[data-item-id]");
    expect(await techFeedItems.count()).toBe(15);
    expect(await getRenderedItemIds(techFeedItems)).toEqual(
      sortedItemIds(expectedFeedItemIdsBySection.techFeed),
    );

    const newsFeedSection = sectionByHeading("News Feed");
    const newsFeedItems = newsFeedSection.locator("[data-item-id]");
    expect(await newsFeedItems.count()).toBe(15);
    expect(await getRenderedItemIds(newsFeedItems)).toEqual(
      sortedItemIds(expectedFeedItemIdsBySection.newsFeed),
    );

    // The tag subsection should only contain items from feeds that do not
    // already have explicit feed subsections.
    await expect(
      page.getByRole("heading", { name: "Tech", exact: true }),
    ).toBeVisible({
      timeout: 10000,
    });
    const techTagSection = sectionByHeading("Tech");
    const techTagItems = techTagSection.locator("[data-item-id]");
    expect(await techTagItems.count()).toBe(15);
    expect(await getRenderedItemIds(techTagItems)).toEqual(
      sortedItemIds(expectedFeedItemIdsBySection.techTag),
    );
    await expect(
      page.getByRole("heading", { name: "Uncategorized", exact: true }),
    ).toHaveCount(0);

    // ── 11. Edit view and remove an explicit feed from Content tab ────
    // Navigate to /views page to edit
    await page.goto("/views");
    await expect(
      page.getByRole("tab", { name: /views/i, selected: true }),
    ).toBeVisible({ timeout: 10000 });

    const mainContent = page.locator("main main");
    await mainContent.getByRole("button", { name: `Edit ${viewName}` }).click();

    const editDialog = page.locator('[role="dialog"]');
    await expect(
      editDialog.getByRole("heading", { name: "Edit View" }),
    ).toBeVisible({ timeout: 5000 });

    // Switch to Content tab
    const contentTab = editDialog.getByRole("tab", { name: "Content" });
    await contentTab.click();
    await page.waitForTimeout(300);

    // Remove "Tech Feed" from the feeds list by clicking its chip X
    const techFeedBadge = editDialog
      .locator('[data-slot="badge"]')
      .filter({ hasText: /Tech Feed/i });
    await expect(techFeedBadge).toBeVisible({ timeout: 3000 });
    await techFeedBadge.locator("button").click();
    await expect(techFeedBadge).toHaveCount(0, { timeout: 3000 });

    // Switch back to Display tab. Tech Feed is still part of the view through
    // the selected Tech tag, so its feed subsection remains available.
    const displayTabEdit = editDialog.getByRole("tab", { name: "Display" });
    await displayTabEdit.click();
    await page.waitForTimeout(300);

    const viewSectionRowsAfterDelete = editDialog.locator(
      "[data-view-section-row]",
    );
    // Should still be 4 rows: Tech Feed, News Feed, Tech tag, Uncategorized.
    await expect(viewSectionRowsAfterDelete).toHaveCount(4, { timeout: 5000 });
    await expect(
      viewSectionRowsAfterDelete.nth(0).getByText("Tech Feed", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 3000 });

    // Save the edit
    await editDialog.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("View updated!")).toBeVisible({
      timeout: 10000,
    });
  });

  test("keeps a tag subsection outside the View content filters", async ({
    page,
  }) => {
    const { email, password } = await seedViewLayoutData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      SELF_HOSTED_RSS_SERVER_PORT,
    );
    testEmail = email;
    const viewName = "Empty Tag Subsection View";
    const tagName = "Unassigned Tag";

    await signIn({ page, email, password });
    await openSidebar(page);

    const viewsSection = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Views" }),
    });
    await viewsSection
      .locator('[data-sidebar="group-label"] [data-sidebar="menu-button"]')
      .nth(1)
      .click();

    const addDialog = page.getByRole("dialog", { name: "Add View" });
    await expect(addDialog).toBeVisible();
    await addDialog.getByPlaceholder("My View").fill(viewName);
    await addDialog.getByRole("button", { name: "Add View" }).click();
    await expect(page.getByText("View added!")).toBeVisible({
      timeout: 10_000,
    });

    await openSidebar(page);
    const viewButton = viewsSection
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: viewName })
      .first();
    const viewMenuItem = viewButton.locator(
      'xpath=ancestor::*[@data-sidebar="menu-item"]',
    );
    await viewMenuItem.locator('[data-sidebar="menu-button"]').nth(1).click();

    const editDialog = page.getByRole("dialog", { name: "Edit View" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("tab", { name: "Display" }).click();
    const viewSectionsLabel = editDialog.getByText("View sections", {
      exact: true,
    });
    await viewSectionsLabel.locator("..").getByRole("button").first().click();
    const sectionSearch = page
      .getByPlaceholder("Search feeds or tags...")
      .filter({ visible: true });
    await sectionSearch.fill(tagName);
    await sectionSearch
      .locator("xpath=ancestor::*[@cmdk-root]")
      .getByRole("option", { name: `#${tagName}`, exact: true })
      .click();

    await editDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("View updated!")).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/views");
    await page.reload();
    await expect(
      page.getByRole("tab", { name: /views/i, selected: true }),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .locator("main main")
      .getByRole("button", { name: `Edit ${viewName}` })
      .click();

    const reloadedEditDialog = page.getByRole("dialog", { name: "Edit View" });
    await expect(reloadedEditDialog).toBeVisible();
    await reloadedEditDialog.getByRole("tab", { name: "Display" }).click();
    await expect(
      reloadedEditDialog
        .locator("[data-view-section-row]")
        .filter({ hasText: tagName }),
    ).toHaveCount(1);
  });
});
