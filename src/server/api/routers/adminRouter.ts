import { ORPCError } from "@orpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { isPublicSignupEnabled } from "~/lib/constants";
import { protectedProcedure, publicProcedure } from "~/server/orpc/base";
import { auth } from "~/server/auth";
import { appConfig, user } from "~/server/db/schema";
import { db } from "~/server/db";

// Admin procedure that requires admin role
const adminProcedure = protectedProcedure.use(({ context, next }) => {
  if (context.user.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
  return next();
});

// List all users with offset-based pagination
export const listUsers = adminProcedure
  .input(
    z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      searchQuery: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const result = await auth.api.listUsers({
      headers: context.headers,
      query: {
        limit: input.limit,
        offset: input.offset,
        searchField: input.searchQuery ? "email" : undefined,
        searchValue: input.searchQuery,
      },
    });

    return {
      users: result.users,
      total: result.total,
    };
  });

// Get a single user by ID with their sessions
export const getUserById = adminProcedure
  .input(
    z.object({
      userId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const sessionsResult = await auth.api.listUserSessions({
      headers: context.headers,
      body: { userId: input.userId },
    });

    // Find the specific user - we need to search for them
    const allUsers = await auth.api.listUsers({
      headers: context.headers,
      query: {
        limit: 1000,
        offset: 0,
      },
    });

    const user = allUsers.users.find((u) => u.id === input.userId);

    if (!user) {
      throw new ORPCError("NOT_FOUND", { message: "User not found" });
    }

    return {
      user,
      sessions: sessionsResult.sessions,
    };
  });

// Ban a user
export const banUser = adminProcedure
  .input(
    z.object({
      userId: z.string(),
      banReason: z.string().optional(),
      banExpiresIn: z.number().optional(), // seconds
    }),
  )
  .handler(async ({ context, input }) => {
    await auth.api.banUser({
      headers: context.headers,
      body: {
        userId: input.userId,
        banReason: input.banReason,
        banExpiresIn: input.banExpiresIn,
      },
    });
  });

// Unban a user
export const unbanUser = adminProcedure
  .input(
    z.object({
      userId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    await auth.api.unbanUser({
      headers: context.headers,
      body: { userId: input.userId },
    });
  });

// Revoke all sessions for a user
export const revokeUserSessions = adminProcedure
  .input(
    z.object({
      userId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    await auth.api.revokeUserSessions({
      headers: context.headers,
      body: { userId: input.userId },
    });
  });

// Impersonate a user
export const impersonateUser = adminProcedure
  .input(
    z.object({
      userId: z.string(),
    }),
  )
  .handler(async ({ context, input }) => {
    const result = await auth.api.impersonateUser({
      headers: context.headers,
      body: { userId: input.userId },
    });

    return result;
  });

// Stop impersonating - uses protectedProcedure because when impersonating,
// the user context is the impersonated user (not admin). We check impersonatedBy instead.
export const stopImpersonating = protectedProcedure.handler(
  async ({ context }) => {
    // Allow if user is admin OR if this is an impersonation session
    const isAdmin = context.user.role === "admin";
    const isImpersonating = !!context.session.impersonatedBy;

    if (!isAdmin && !isImpersonating) {
      throw new ORPCError("FORBIDDEN", {
        message: "Must be admin or in impersonation session",
      });
    }

    const result = await auth.api.stopImpersonating({
      headers: context.headers,
    });

    return result;
  },
);

// Get public signup setting
export const getPublicSignupSetting = adminProcedure.handler(async () => {
  const config = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "public-signup-enabled"))
    .get();

  return {
    enabled: isPublicSignupEnabled(config?.value),
  };
});

// Set public signup setting
export const setPublicSignupSetting = adminProcedure
  .input(
    z.object({
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input }) => {
    await db
      .insert(appConfig)
      .values({
        key: "public-signup-enabled",
        value: input.enabled ? "true" : "false",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value: input.enabled ? "true" : "false",
          updatedAt: new Date(),
        },
      });

    return { enabled: input.enabled };
  });

// Public procedure to check if signups are enabled (used by sign-up page)
export const getIsPublicSignupEnabled = publicProcedure.handler(async () => {
  const config = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, "public-signup-enabled"))
    .get();

  const userCount = await db.select({ count: count() }).from(user).get();
  const isFirstUser = (userCount?.count ?? 0) === 0;

  return {
    enabled: isPublicSignupEnabled(config?.value) || isFirstUser,
    isFirstUser,
  };
});
