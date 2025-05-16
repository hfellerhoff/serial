import { type DatabaseView } from "~/server/db/schema";

export function sortViewsByPlacement(views: DatabaseView[]) {
  return views.toSorted((a, b) => {
    if (a.placement < b.placement) {
      return 1;
    }
    if (a.placement > b.placement) {
      return -1;
    }
    return 0;
  });
}
