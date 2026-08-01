import { expect, test } from "@playwright/test";
import {
  SELF_HOSTED_APP_PORT,
  SELF_HOSTED_TURSO_PORT,
} from "../fixtures/ports";
import {
  cleanupUser,
  getBookmarkState,
  seedArticleData,
  seedBookmarkProjectionData,
} from "../fixtures/seed-db";
import { signIn } from "../fixtures/auth";

test.describe("Bookmark Serial-app flow", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  let testEmail: string;

  test.afterEach(async () => {
    if (testEmail) await cleanupUser(SELF_HOSTED_TURSO_PORT, testEmail);
  });

  test("renders the mixed card and protected native reader with state and progress", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );

    await page.route("https://images.example.com/**", (route) => route.abort());
    await page.route("https://www.youtube-nocookie.com/**", (route) =>
      route.abort(),
    );
    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();

    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toContainText("Captured Bookmark", {
      timeout: 30_000,
    });
    await expect(
      page.locator(`article[data-item-id="${feedItemId}"]`),
    ).toHaveCount(0);

    await bookmarkCard.getByRole("link").click();
    await expect(page).toHaveURL(`/bookmark/${bookmarkId}`);
    await expect(
      page.getByRole("heading", { name: "Captured Bookmark" }),
    ).toBeVisible();
    await expect(page.getByText("Captured Bookmark body")).toBeVisible();
    await expect(
      page.locator("script[data-testid=unsafe-capture-script]"),
    ).toHaveCount(0);

    const externalLink = page.getByRole("link", {
      name: "External reader link",
    });
    await expect(externalLink).toHaveAttribute("target", "_blank");
    await expect(externalLink).toHaveAttribute("rel", "noopener noreferrer");
    const remoteImage = page.getByAltText("Reader image");
    await expect(remoteImage).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(remoteImage).toHaveAttribute("loading", "lazy");
    await expect(page.locator("[data-article-video-embed]")).toBeVisible();
    await expect(page.getByTitle("YouTube video player")).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove Saved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open original" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: /Archive/ }).click();
    await expect(page.getByRole("button", { name: /Unarchive/ })).toBeVisible();
    await page.getByRole("button", { name: /Remove Saved/ }).click();
    await expect(page.getByRole("button", { name: /Add Saved/ })).toBeVisible();

    await page.mouse.wheel(0, 600);
    await expect
      .poll(async () => {
        const state = await getBookmarkState(
          SELF_HOSTED_TURSO_PORT,
          bookmarkId,
        );
        return {
          isSaved: state?.isSaved,
          isRead: state?.isRead,
          hasProgress: (state?.duration ?? 0) > 0,
        };
      })
      .toEqual({ isSaved: false, isRead: true, hasProgress: true });
  });

  test("refreshes a duplicate without losing organization when capture fails", async ({
    page,
  }) => {
    const { email, password, feedItemId } = await seedArticleData(
      SELF_HOSTED_TURSO_PORT,
      SELF_HOSTED_APP_PORT,
    );
    testEmail = email;
    const { bookmarkId, sourceUrl } = await seedBookmarkProjectionData(
      SELF_HOSTED_TURSO_PORT,
      email,
      feedItemId,
    );
    await signIn({ page, email, password });
    await page.getByRole("tab", { name: /Saved/ }).click();
    await expect(
      page.locator(
        `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
      ),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Add Feed or Bookmark" }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByPlaceholder("Paste a URL or search for a feed...")
      .fill(sourceUrl);
    const bookmarkOption = dialog.getByRole("option", {
      name: /Bookmark page to read later/,
    });
    await expect(bookmarkOption).toBeVisible({ timeout: 10_000 });
    await bookmarkOption.click();

    await expect(
      dialog.getByText(/previous Page capture is still available/i),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      dialog
        .locator('[data-slot="selectable-chip-list"][data-label="Views"]')
        .getByRole("button", { name: "All" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
