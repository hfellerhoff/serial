import type { ApplicationStore } from "./data/store";

export function sortFeedItemsOrderByDate(
  feedItems: ApplicationStore["feedItemsDict"],
) {
  return function (a: string, b: string) {
    const itemA = feedItems[a];
    const itemB = feedItems[b];

    if (!itemA || !itemB) return 0;

    if (itemA.postedAt < itemB.postedAt) return 1;
    return -1;
  };
}
