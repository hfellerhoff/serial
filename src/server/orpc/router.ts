import * as feedRouter from "~/server/api/routers/feed-router";
import * as feedItemRouter from "~/server/api/routers/feedItemRouter";
import * as instapaperRouter from "~/server/api/routers/instapaperRouter";
import * as userConfigRouter from "~/server/api/routers/userConfigRouter";

export const orpcRouter = {
  feed: feedRouter,
  feedItem: feedItemRouter,
  userConfig: userConfigRouter,
  instapaper: instapaperRouter,
};
