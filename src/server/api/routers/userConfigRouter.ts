import { sql } from "drizzle-orm";
import { z } from "zod";

import { userConfig } from "~/server/db/schema";
import { protectedProcedure, publicProcedure } from "~/server/orpc/base";

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

export const setThemeHSL = protectedProcedure
  .input(
    z.object({
      theme: z.enum(["light", "dark"]),
      hsl: z.tuple([z.number(), z.number(), z.number()]),
    }),
  )
  .handler(async ({ context, input }) => {
    let key: keyof typeof userConfig = "lightHSL";
    if (input.theme === "dark") {
      key = "darkHSL";
    }

    const formattedHSL = `${input.hsl[0]} ${input.hsl[1]}% ${input.hsl[2]}%`;

    await context.db
      .insert(userConfig)
      .values({
        userId: context.user.id,
        [key]: formattedHSL,
      })
      .onConflictDoUpdate({
        target: userConfig.userId,
        set: {
          [key]: formattedHSL,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });
  });

export const getConfig = publicProcedure.handler(
  async ({ context }): Promise<UserConfigValues> => {
    if (!context.user?.id) {
      return { lightHSL: undefined, darkHSL: undefined };
    }

    const config = await context.db.query.userConfig.findFirst({
      where: sql`user_id = ${context.user.id}`,
    });

    return {
      lightHSL: parseHSL(config?.lightHSL),
      darkHSL: parseHSL(config?.darkHSL),
    };
  },
);
