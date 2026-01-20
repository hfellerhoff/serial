import { z } from "zod";

export const FEED_ITEM_ORIENTATION = {
  HORIZONTAL: "horizontal",
  VERTICAL: "vertical",
} as const;
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

export const VIEW_CONTENT_TYPE = {
  ALL: "all",
  LONGFORM: "longform",
  HORIZONTAL_VIDEO: "horizontal-video",
  VERTICAL_VIDEO: "vertical-video",
} as const;
export const viewContentTypeSchema = z.enum([
  VIEW_CONTENT_TYPE.ALL,
  VIEW_CONTENT_TYPE.LONGFORM,
  VIEW_CONTENT_TYPE.HORIZONTAL_VIDEO,
  VIEW_CONTENT_TYPE.VERTICAL_VIDEO,
]);
export type ViewContentType = z.infer<typeof viewContentTypeSchema>;

export const VIEW_LAYOUT = {
  LIST: "list",
  LARGE_LIST: "large-list",
  GRID: "grid",
  LARGE_GRID: "large-grid",
} as const;
export const viewLayoutSchema = z.enum([
  VIEW_LAYOUT.LIST,
  VIEW_LAYOUT.LARGE_LIST,
  VIEW_LAYOUT.GRID,
  VIEW_LAYOUT.LARGE_GRID,
]);
export type ViewLayout = z.infer<typeof viewLayoutSchema>;
