import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { adminProcedure } from "./base";
import { queryUserById } from "./queries";
import { protectedProcedure } from "~/server/orpc/base";
import { auth } from "~/server/auth";

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
    const result = await queryUserById(input.userId, context.headers);

    if (!result) {
      throw new ORPCError("NOT_FOUND", { message: "User not found" });
    }

    return result;
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
