import { expect, test } from "@playwright/test";
import { signIn } from "../fixtures/auth";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  seedMixedViewSectionCase,
  seedSidebarFeedAvailabilityData,
  seedSidebarFeedSortCase,
} from "../fixtures/seed-db";
import type { Page } from "@playwright/test";

async function applicationStoreState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<{
        state?: {
          hasInitialData?: boolean;
          scopeFeedItemIds?: Record<string, string[]>;
        };
      } | null>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const request = transaction
          .objectStore("keyval")
          .get("serial-application-store::normalized:v1::root");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    } finally {
      database.close();
    }
  });
}

async function viewsStoreState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      return await new Promise<{
        state?: {
          viewsDict?: Record<
            number,
            { viewSections?: Array<{ itemType: string; itemId: number }> }
          >;
        };
      } | null>((resolve, reject) => {
        const transaction = database.transaction("keyval", "readonly");
        const request = transaction
          .objectStore("keyval")
          .get("serial-views-store");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    } finally {
      database.close();
    }
  });
}

test.describe("authoritative sidebar navigation", () => {
  let testEmail = "";

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("shows Bookmark-only View and Tag availability before either scope is opened", async ({
    page,
  }) => {
    const fixture = await seedMixedViewSectionCase(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
      {
        feedSectionFeedItem: false,
        tagSectionFeedItem: false,
        tagSectionBookmark: true,
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

    const views = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Views" }),
    });
    const tags = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Tags" }),
    });
    const viewButton = views
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: fixture.viewName });
    const tagButton = tags
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: fixture.tagName });

    await expect(viewButton).toBeVisible({ timeout: 30_000 });
    await expect(tagButton).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await viewsStoreState(page))?.state?.viewsDict?.[fixture.viewId]
            ?.viewSections,
      )
      .toHaveLength(2);
    await expect(viewButton.locator(".bg-sidebar-accent")).toHaveCount(1);
    await expect(tagButton.locator(".bg-sidebar-accent")).toHaveCount(1);
    await expect(
      views
        .locator('[data-sidebar="menu-button"]')
        .filter({ hasText: fixture.emptyViewName })
        .locator(".bg-sidebar-accent"),
    ).toHaveCount(0);

    await expect
      .poll(
        async () => (await applicationStoreState(page))?.state?.hasInitialData,
      )
      .toBe(true);
    const scopeKeys = Object.keys(
      (await applicationStoreState(page))?.state?.scopeFeedItemIds ?? {},
    );
    expect(scopeKeys).not.toContain(`view:${fixture.viewId}:unread`);

    await page.getByRole("radio", { name: fixture.viewName }).click();
    const bookmark = page.locator(
      `article[data-item-id="${fixture.items.tagSectionBookmark}"]`,
    );
    await expect(bookmark).toBeVisible({ timeout: 30_000 });
    await bookmark.getByRole("link").hover();
    await page.keyboard.press("s");

    await expect(viewButton.locator(".bg-sidebar-accent")).toHaveCount(0);
    await expect(tagButton.locator(".bg-sidebar-accent")).toHaveCount(0);
    await page.getByRole("tab", { name: /Saved/ }).click();
    await expect(viewButton.locator(".bg-sidebar-accent")).toHaveCount(1);
    await expect(tagButton.locator(".bg-sidebar-accent")).toHaveCount(1);
  });

  test("keeps globally populated Feeds below the current View buckets on initial load", async ({
    page,
  }) => {
    const fixture = await seedSidebarFeedSortCase(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });
    await page.getByRole("radio", { name: fixture.viewName }).click();

    const feeds = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });
    const feedMenu = feeds.locator('[data-sidebar="menu"]');

    for (const feedName of Object.values(fixture.sortedFeeds)) {
      await expect(
        feeds
          .locator('[data-sidebar="menu-button"]')
          .filter({ hasText: feedName }),
      ).toBeVisible({ timeout: 30_000 });
    }

    await expect
      .poll(() =>
        feedMenu.evaluate((menu, names) => {
          const children = Array.from(menu.children);
          const itemIndex = (name: string) =>
            children.findIndex((child) =>
              Array.from(
                child.querySelectorAll('[data-sidebar="menu-button"]'),
              ).some((button) => button.textContent?.trim() === name),
            );
          const inViewWithContentIndex = itemIndex(names.inViewWithContent);
          const inViewWithoutContentIndex = itemIndex(
            names.inViewWithoutContent,
          );
          const otherActiveIndex = itemIndex(names.otherActive);
          const inactiveIndex = itemIndex(names.inactive);
          return {
            isOrdered: [
              inViewWithContentIndex,
              inViewWithoutContentIndex,
              otherActiveIndex,
              inactiveIndex,
            ].every(
              (index, position, order) =>
                index >= 0 && (position === 0 || order[position - 1]! < index),
            ),
            hasActiveDivider: children.some(
              (child, index) =>
                child.tagName === "HR" &&
                index > inViewWithoutContentIndex &&
                index < otherActiveIndex,
            ),
            hasInactiveDivider: children.some(
              (child, index) =>
                child.tagName === "HR" &&
                index > otherActiveIndex &&
                index < inactiveIndex,
            ),
          };
        }, fixture.sortedFeeds),
      )
      .toEqual({
        isOrdered: true,
        hasActiveDivider: true,
        hasInactiveDivider: true,
      });
  });

  test("shows global Feed availability for inactive content beyond the retained center page", async ({
    page,
  }) => {
    const fixture = await seedSidebarFeedAvailabilityData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = fixture.email;

    await signIn({
      page,
      email: fixture.email,
      password: fixture.password,
    });

    const feeds = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Feeds" }),
    });
    const overflowFeedButton = feeds
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: fixture.overflowFeedName });

    await expect(overflowFeedButton).toBeVisible({ timeout: 30_000 });
    await expect(overflowFeedButton.locator(".bg-sidebar-accent")).toHaveCount(
      1,
    );

    const tags = page.locator('[data-sidebar="group"]').filter({
      has: page.locator('[data-sidebar="group-label"]', { hasText: "Tags" }),
    });
    await expect(
      tags
        .locator('[data-sidebar="menu-button"]')
        .filter({ hasText: /^All$/ })
        .locator(".bg-sidebar-accent"),
    ).toHaveCount(1);
  });
});
