import type { ApplicationStore } from "./data/store";

export function sortFeedItemsOrderByDate(
  feedItems: ApplicationStore["feedItemsDict"],
) {
  return function (a: string, b: string) {
    const itemA = feedItems[a];
    const itemB = feedItems[b];

    if (!itemA || !itemB) return 0;

    const timeA =
      itemA.postedAt instanceof Date
        ? itemA.postedAt.getTime()
        : new Date(itemA.postedAt).getTime();
    const timeB =
      itemB.postedAt instanceof Date
        ? itemB.postedAt.getTime()
        : new Date(itemB.postedAt).getTime();

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    if (itemA.title !== itemB.title) {
      return itemA.title.localeCompare(itemB.title);
    }

    return itemA.id.localeCompare(itemB.id);
  };
}
