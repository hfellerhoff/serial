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
    await expect(page).toHaveURL(`/read/${bookmarkId}`);
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

    const readerArticle = page.locator("article");
    const initialArticleWidth = await readerArticle.evaluate(
      (article) => article.getBoundingClientRect().width,
    );
    await page
      .locator("header button")
      .filter({ has: page.locator("svg.lucide-plus") })
      .click();
    await expect
      .poll(() =>
        readerArticle.evaluate(
          (article) => article.getBoundingClientRect().width,
        ),
      )
      .toBeGreaterThan(initialArticleWidth);

    await page
      .locator("header button")
      .filter({ has: page.locator("svg.lucide-minus") })
      .click();
    await expect
      .poll(() =>
        readerArticle.evaluate(
          (article) => article.getBoundingClientRect().width,
        ),
      )
      .toBe(initialArticleWidth);

    const scrollContainer = page.locator('[data-slot="sidebar-inset"]');
    const scrollBox = await scrollContainer.boundingBox();
    if (scrollBox) {
      await page.mouse.move(
        scrollBox.x + scrollBox.width / 2,
        scrollBox.y + scrollBox.height / 2,
      );
    }
    for (let index = 0; index < 12; index += 1) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(50);
    }
    await expect
      .poll(
        async () =>
          (await getBookmarkState(SELF_HOSTED_TURSO_PORT, bookmarkId))
            ?.progress ?? 0,
      )
      .toBeGreaterThan(0);
    const savedBookmarkProgress = (
      await getBookmarkState(SELF_HOSTED_TURSO_PORT, bookmarkId)
    )?.progress;
    expect(savedBookmarkProgress).toBeGreaterThan(5);

    await page.goto("/");
    await page.getByRole("tab", { name: /Saved/ }).click();
    await expect(bookmarkCard).toBeVisible({ timeout: 15_000 });
    await bookmarkCard.getByRole("link").click();
    await expect(
      page.getByRole("heading", { name: "Captured Bookmark" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() => scrollContainer.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Unsave" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open in Website" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: /Archive/ }).click();
    await expect(page.getByRole("button", { name: /Unarchive/ })).toBeVisible();
    await page.getByRole("button", { name: "Unsave" }).click();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

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
    const bookmarkCard = page.locator(
      `article[data-item-id="${bookmarkId}"][data-entity-kind="bookmark"]`,
    );
    await expect(bookmarkCard).toBeVisible({ timeout: 30_000 });
    await expect(
      bookmarkCard.getByTestId("empty-thumbnail-placeholder"),
    ).toBeVisible();

    await bookmarkCard.hover();
    await expect(
      bookmarkCard.getByRole("button", { name: "Copy Bookmark URL" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        bookmarkCard
          .getByRole("button")
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute("aria-label")),
          ),
      )
      .toEqual(["Delete Bookmark", "Edit Bookmark", "Unsave", "Archive"]);
    await bookmarkCard.getByRole("button", { name: "Edit Bookmark" }).click();

    const editDialog = page.getByRole("dialog");
    await expect(
      editDialog.getByRole("heading", { name: "Edit Bookmark" }),
    ).toBeAttached();
    await expect(
      editDialog.getByTestId("bookmark-capture-feedback"),
    ).toHaveCount(0);
    const deleteButton = editDialog.getByRole("button", {
      name: "Delete Bookmark",
    });
    const doneButton = editDialog.getByRole("button", { name: "Done" });
    await expect(deleteButton).toBeVisible();
    await expect(doneButton).toBeVisible();
    await expect
      .poll(async () => {
        const [deleteBox, doneBox] = await Promise.all([
          deleteButton.boundingBox(),
          doneButton.boundingBox(),
        ]);
        return Math.abs((deleteBox?.width ?? 0) - (doneBox?.width ?? 0));
      })
      .toBeLessThanOrEqual(1);
    await doneButton.click();
    await expect(editDialog).toHaveCount(0);

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
    await expect(
      dialog.getByRole("link", { name: /Open Bookmark|Open original/ }),
    ).toHaveCount(0);
  });
});
