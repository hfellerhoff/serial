import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "~/server/orpc/base";

/** Admin procedure that requires admin role */
export const adminProcedure = protectedProcedure.use(({ context, next }) => {
  if (context.user.role !== "admin") {
    throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
  }
  return next();
});
