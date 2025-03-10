import { feedRouter } from "~/server/api/routers/feedRouter";
import { feedItemRouter } from "~/server/api/routers/feedItemRouter";
import { contentCategoriesRouter } from "~/server/api/routers/contentCategoryRouter";
import { createTRPCRouter } from "~/server/api/trpc";
import { userConfigRouter } from "./routers/userConfigRouter";

export const appRouter = createTRPCRouter({
  feeds: feedRouter,
  feedItems: feedItemRouter,
  contentCategories: contentCategoriesRouter,
  userConfig: userConfigRouter,
});

export type AppRouter = typeof appRouter;
