import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { userConfig } from "~/server/db/schema";

export type UserConfigValues = {
  lightHSL: number[] | undefined;
  darkHSL: number[] | undefined;
};

function parseHSL(hsl: string | undefined): number[] | undefined {
  if (!hsl) return undefined;
  return hsl
    .split(" ")
    .map((value) => value.replace("%", ""))
    .map(Number);
}

export const userConfigRouter = createTRPCRouter({
  setThemeHSL: protectedProcedure
    .input(
      z.object({
        theme: z.enum(["light", "dark"]),
        hsl: z.tuple([z.number(), z.number(), z.number()]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let key: keyof typeof userConfig = "lightHSL";
      if (input.theme === "dark") {
        key = "darkHSL";
      }

      const formattedHSL = `${input.hsl[0]} ${input.hsl[1]}% ${input.hsl[2]}%`;

      await ctx.db
        .insert(userConfig)
        .values({
          userId: ctx.auth!.user.id,
          [key]: formattedHSL,
        })
        .onConflictDoUpdate({
          target: userConfig.userId,
          set: {
            [key]: formattedHSL,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    }),
  getConfig: publicProcedure.query(
    async ({ ctx }): Promise<UserConfigValues> => {
      if (!ctx.auth?.user.id) {
        return { lightHSL: undefined, darkHSL: undefined };
      }

      const userConfig = await ctx.db.query.userConfig.findFirst({
        where: sql`user_id = ${ctx.auth.user.id}`,
      });

      return {
        lightHSL: parseHSL(userConfig?.lightHSL),
        darkHSL: parseHSL(userConfig?.darkHSL),
      };
    },
  ),
});
