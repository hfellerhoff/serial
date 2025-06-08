import { and, eq, like } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";
import { userEmailSchema, userNameSchema } from "../schemas";

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
  updateName: protectedProcedure
    .input(
      z.object({
        name: userNameSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(user)
        .set({
          name: input.name,
        })
        .where(eq(user.id, ctx.auth!.user.id));
    }),
  updateEmail: protectedProcedure
    .input(
      z.object({
        email: userEmailSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await db
        .update(user)
        .set({
          email: input.email,
        })
        .where(eq(user.id, ctx.auth!.user.id));
    }),
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    await db.delete(user).where(eq(user.id, ctx.auth!.user.id));
  }),
});
