import { and, eq, like } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { userNameSchema } from "../schemas";
import { protectedProcedure, publicProcedure } from "~/server/orpc/base";
import { auth } from "~/server/auth";
import { getOtpCooldownRemaining, OTP_COOLDOWN_SECONDS } from "~/server/otp";
import { getUserPlanId } from "~/server/subscriptions/helpers";
import { IS_BILLING_ENABLED } from "~/server/subscriptions/polar";
import { user } from "~/server/db/schema";

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

export const deleteUser = protectedProcedure.handler(async ({ context }) => {
  if (IS_BILLING_ENABLED) {
    const planId = await getUserPlanId(context.user.id);
    if (planId !== "free") {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "Please cancel your active subscription before deleting your account.",
      });
    }
  }

  await context.db.delete(user).where(eq(user.id, context.user.id));
});

/**
 * Request a verification code. Returns the number of seconds until the next
 * resend is allowed. If a cooldown is active from a prior send (including the
 * automatic send-on-signup), returns the remaining time without re-sending.
 */
export const requestVerificationCode = protectedProcedure.handler(
  async ({ context }) => {
    const email = context.user.email;

    // If a cooldown is active (from a prior send or the automatic
    // send-on-signup), return the remaining time without re-sending.
    const remaining = await getOtpCooldownRemaining(email);
    if (remaining > 0) {
      return { sent: false, retryAfter: remaining };
    }

    // No cooldown — send a new code. This triggers sendVerificationOTP
    // in the auth config, which calls setOtpCooldown().
    await auth.api.sendVerificationOTP({
      body: { email, type: "email-verification" },
    });

    return { sent: true, retryAfter: OTP_COOLDOWN_SECONDS };
  },
);
