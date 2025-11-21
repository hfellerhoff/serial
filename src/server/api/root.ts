import { contentCategoriesRouter } from "~/server/api/routers/contentCategoriesRouter";
import { feedCategoriesRouter } from "~/server/api/routers/feedCategoriesRouter";
import { createTRPCRouter } from "~/server/api/trpc";
import { userRouter } from "./routers/userRouter";
import { viewRouter } from "./routers/viewRouter";

export const appRouter = createTRPCRouter({
  user: userRouter,
  contentCategories: contentCategoriesRouter,
  feedCategories: feedCategoriesRouter,
  views: viewRouter,
});

export type AppRouter = typeof appRouter;
