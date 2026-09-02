import type { Page } from "@playwright/test";

/**
 * Drop the persisted React Query cache so state seeded directly in the
 * database is refetched instead of served stale from the restore.
 */
export async function clearQueryCache(page: Page) {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");
    } catch {
      // localStorage may not be available in some contexts
    }
  });
}
