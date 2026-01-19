import type { DatabaseView } from "~/server/db/schema";

export function sortViewsByPlacement<T extends DatabaseView>(views: T[]) {
  return views.sort((a, b) => {
    if (a.placement < b.placement) {
      return 1;
    }
    if (a.placement > b.placement) {
      return -1;
    }
    return 0;
  });
}
