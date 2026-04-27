import type { DiffEntry } from "~/server/api/routers/initialRouter";
import type { ApplicationFeedItem } from "~/server/db/schema";

/**
 * Applies a list of diff entries to the feed items dict and order array.
 * Mutates both `feedItemsDict` and `feedItemsOrder` in place for efficiency
 * — callers are expected to pass shallow copies.
 *
 * Returns the set of existing IDs (maintained across calls when processing
 * multiple diffs in a loop).
 */
export function applyDiffEntries(
  feedItemsDict: Record<string, ApplicationFeedItem>,
  feedItemsOrder: string[],
  existingIds: Set<string>,
  diff: DiffEntry[],
): void {
  for (const entry of diff) {
    switch (entry.status) {
      case "unchanged":
        // Client already has the correct version
        break;
      case "updated":
        feedItemsDict[entry.item.id] = entry.item;
        break;
      case "new":
        feedItemsDict[entry.item.id] = entry.item;
        if (!existingIds.has(entry.item.id)) {
          feedItemsOrder.push(entry.item.id);
          existingIds.add(entry.item.id);
        }
        break;
      case "deleted": {
        delete feedItemsDict[entry.id];
        const idx = feedItemsOrder.indexOf(entry.id);
        if (idx !== -1) {
          feedItemsOrder.splice(idx, 1);
          existingIds.delete(entry.id);
        }
        break;
      }
    }
  }
}
