import { expect, test } from "@playwright/test";

test("homepage loads successfully", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Serial/i);
  await expect(
    page.getByRole("button", { name: "Get Started" }).first(),
  ).toBeVisible();
});
