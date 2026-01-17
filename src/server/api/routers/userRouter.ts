import { and, eq, like } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure } from "~/server/orpc/base";
import { user } from "~/server/db/schema";
import { userEmailSchema, userNameSchema } from "../schemas";

export const checkIsLegacyUser = publicProcedure
  .input(
    z.object({
      email: z.string().email(),
    }),
  )
  .handler(async ({ context, input }) => {
    const users = await context.db
      .select()
      .from(user)
      .where(and(eq(user.email, input.email), like(user.id, "user_%")));

    if (users.length > 0) {
      return true;
    }

    return false;
  });

export const getIsLegacyUser = publicProcedure
  .input(
    z.object({
      email: z.string().email(),
    }),
  )
  .handler(async ({ context, input }) => {
    const users = await context.db
      .select()
      .from(user)
      .where(and(eq(user.email, input.email), like(user.id, "user_%")));

    if (users.length > 0) {
      return true;
    }

    return false;
  });

export const updateName = protectedProcedure
  .input(
    z.object({
      name: userNameSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db
      .update(user)
      .set({
        name: input.name,
      })
      .where(eq(user.id, context.user.id));
  });

export const updateEmail = protectedProcedure
  .input(
    z.object({
      email: userEmailSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    await context.db
      .update(user)
      .set({
        email: input.email,
      })
      .where(eq(user.id, context.user.id));
  });

export const deleteUser = protectedProcedure.handler(async ({ context }) => {
  await context.db.delete(user).where(eq(user.id, context.user.id));
});
