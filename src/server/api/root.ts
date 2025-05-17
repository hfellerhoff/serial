import { feedRouter } from "~/server/api/routers/feedRouter";
import { feedItemRouter } from "~/server/api/routers/feedItemRouter";
import { contentCategoriesRouter } from "~/server/api/routers/contentCategoriesRouter";
import { feedCategoriesRouter } from "~/server/api/routers/feedCategoriesRouter";
import { createTRPCRouter } from "~/server/api/trpc";
import { userConfigRouter } from "./routers/userConfigRouter";
import { userRouter } from "./routers/userRouter";
import { viewRouter } from "./routers/viewRouter";

export const appRouter = createTRPCRouter({
  user: userRouter,
  feeds: feedRouter,
  feedItems: feedItemRouter,
  contentCategories: contentCategoriesRouter,
  feedCategories: feedCategoriesRouter,
  userConfig: userConfigRouter,
  views: viewRouter,
});

export type AppRouter = typeof appRouter;
