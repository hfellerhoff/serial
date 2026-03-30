import { sql } from "drizzle-orm";
import { z } from "zod";

import { parseHSL, serializeHSL } from "./hsl";
import { ARTICLE_FONT_FAMILIES } from "~/lib/constants/article-fonts";
import { userConfig } from "~/server/db/schema";
import { protectedProcedure, publicProcedure } from "~/server/orpc/base";

export type UserConfigValues = {
  lightHSL: number[] | undefined;
  darkHSL: number[] | undefined;
  articleFontSize: number | undefined;
  articleFontFamily: string | undefined;
};

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

    const formattedHSL = serializeHSL(input.hsl);

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

export const setArticleFont = protectedProcedure
  .input(
    z.object({
      fontSize: z.number().min(12).max(24).optional(),
      fontFamily: z.enum(ARTICLE_FONT_FAMILIES).optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const set: Record<string, unknown> = {
      updatedAt: sql`CURRENT_TIMESTAMP`,
    };
    if (input.fontSize !== undefined) set.articleFontSize = input.fontSize;
    if (input.fontFamily !== undefined)
      set.articleFontFamily = input.fontFamily;

    await context.db
      .insert(userConfig)
      .values({
        userId: context.user.id,
        ...set,
      })
      .onConflictDoUpdate({
        target: userConfig.userId,
        set,
      });
  });

export const getConfig = publicProcedure.handler(
  async ({ context }): Promise<UserConfigValues> => {
    if (!context.user?.id) {
      return {
        lightHSL: undefined,
        darkHSL: undefined,
        articleFontSize: undefined,
        articleFontFamily: undefined,
      };
    }

    const config = await context.db.query.userConfig.findFirst({
      where: sql`user_id = ${context.user.id}`,
    });

    return {
      lightHSL: parseHSL(config?.lightHSL),
      darkHSL: parseHSL(config?.darkHSL),
      articleFontSize: config?.articleFontSize ?? undefined,
      articleFontFamily: config?.articleFontFamily ?? undefined,
    };
  },
);
