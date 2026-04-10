import * as adminRouter from "~/server/api/routers/adminRouter";
import * as feedRouter from "~/server/api/routers/feed-router";
import * as feedItemRouter from "~/server/api/routers/feedItemRouter";
import * as initialRouter from "~/server/api/routers/initialRouter";
import * as instapaperRouter from "~/server/api/routers/instapaperRouter";
import * as userConfigRouter from "~/server/api/routers/userConfigRouter";
import * as userRouter from "~/server/api/routers/userRouter";
import * as feedCategoriesRouter from "~/server/api/routers/feedCategoriesRouter";
import * as contentCategoriesRouter from "~/server/api/routers/contentCategoriesRouter";
import * as viewRouter from "~/server/api/routers/viewRouter";
import * as viewFeedsRouter from "~/server/api/routers/viewFeedsRouter";
import * as subscriptionRouter from "~/server/api/routers/subscriptionRouter";

export const orpcRouter = {
  admin: adminRouter,
  feed: feedRouter,
  feedItem: feedItemRouter,
  initial: initialRouter,
  userConfig: userConfigRouter,
  instapaper: instapaperRouter,
  user: userRouter,
  feedCategories: feedCategoriesRouter,
  contentCategories: contentCategoriesRouter,
  view: viewRouter,
  viewFeeds: viewFeedsRouter,
  subscription: subscriptionRouter,
};
