import { z } from "zod";
import { VIDEO_ORIENTATION } from "~/lib/content/descriptor";

export const FEED_ITEM_ORIENTATION = VIDEO_ORIENTATION;
export const feedItemOrientationSchema = z.enum([
  FEED_ITEM_ORIENTATION.HORIZONTAL,
  FEED_ITEM_ORIENTATION.VERTICAL,
]);

export const VIEW_READ_STATUS = {
  UNREAD: 0,
  READ: 1,
  ANY: 2,
} as const;
export const viewReadStatusSchema = z.number().gte(0).lte(2);

export const VIEW_LAYOUT = {
  LIST: "list",
  LARGE_LIST: "large-list",
  GRID: "grid",
  LARGE_GRID: "large-grid",
} as const;
export const DEFAULT_VIEW_LAYOUT = VIEW_LAYOUT.LARGE_LIST;
export const viewLayoutSchema = z.enum([
  VIEW_LAYOUT.LIST,
  VIEW_LAYOUT.LARGE_LIST,
  VIEW_LAYOUT.GRID,
  VIEW_LAYOUT.LARGE_GRID,
]);
export type ViewLayout = z.infer<typeof viewLayoutSchema>;

export const VIEW_LAYOUT_ITEM_TYPE = {
  TAG: "tag",
  FEED: "feed",
} as const;
export const viewLayoutItemTypeSchema = z.enum([
  VIEW_LAYOUT_ITEM_TYPE.TAG,
  VIEW_LAYOUT_ITEM_TYPE.FEED,
]);
export type ViewLayoutItemType = z.infer<typeof viewLayoutItemTypeSchema>;
