import { feedRouter } from "~/server/api/routers/feed";
import { contentCategoriesRouter } from "~/server/api/routers/content-categories";
import { createTRPCRouter } from "~/server/api/trpc";
import { userConfigRouter } from "./routers/user-config";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  feed: feedRouter,
  contentCategories: contentCategoriesRouter,
  userConfig: userConfigRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
