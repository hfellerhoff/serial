import { ORPCError, os } from "@orpc/server";

import { getRequest } from "@tanstack/react-start/server";
import { db } from "~/server/db";
import { auth } from "~/server/auth";

export async function createRPCContext(opts: { headers: Headers }) {
  const { headers } = getRequest();

  const authResponse = await auth.api.getSession({
    headers,
  });

  return {
    headers: opts.headers,
    session: authResponse?.session,
    user: authResponse?.user,
    db,
  };
}

export type ORPCContext = Awaited<ReturnType<typeof createRPCContext>>;

const o = os.$context<ORPCContext>();

const timingMiddleware = o.middleware(async ({ next, path }) => {
  const start = Date.now();

  try {
    return await next();
  } finally {
    console.log(
      `[oRPC] ${String(path)} took ${Date.now() - start}ms to execute`,
    );
  }
});

export const publicProcedure = o.use(timingMiddleware);

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
  if (!context.session?.id || !context.user?.id) {
    throw new ORPCError("UNAUTHORIZED");
  }

  return next({
    context: {
      session: context.session,
      user: context.user,
      db,
    },
  });
});
