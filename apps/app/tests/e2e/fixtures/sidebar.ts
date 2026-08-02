import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

export async function openSidebar(page: Page) {
  const sidebar = page
    .locator('[data-slot="sidebar"][data-side="left"]')
    .first();

  await expect(sidebar).toBeAttached();
  if ((await sidebar.getAttribute("data-state")) === "expanded") return;

  const menuButton = page.getByRole("button", { name: "Menu", exact: true });
  await expect(menuButton).toBeVisible();
  await expect(async () => {
    if ((await sidebar.getAttribute("data-state")) !== "expanded") {
      await menuButton.click();
    }
    await expect(sidebar).toHaveAttribute("data-state", "expanded", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 5_000 });
}
