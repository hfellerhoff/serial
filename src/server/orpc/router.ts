import * as feedRouter from "~/server/api/routers/feed-router";
import * as feedItemRouter from "~/server/api/routers/feedItemRouter";
import * as userConfigRouter from "~/server/api/routers/userConfigRouter";

export const orpcRouter = {
  feed: feedRouter,
  feedItem: feedItemRouter,
  userConfig: userConfigRouter,
};
