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
