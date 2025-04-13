import { and, eq, like } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

export const userRouter = createTRPCRouter({
  checkIsLegacyUser: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .mutation(async ({ input }) => {
      const users = await db
        .select()
        .from(user)
        .where(and(eq(user.email, input.email), like(user.id, "user_%")));

      if (users.length > 0) {
        return true;
      }

      return false;
    }),
  getIsLegacyUser: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      }),
    )
    .query(async ({ input }) => {
      const users = await db
        .select()
        .from(user)
        .where(and(eq(user.email, input.email), like(user.id, "user_%")));

      if (users.length > 0) {
        return true;
      }

      return false;
    }),
});
