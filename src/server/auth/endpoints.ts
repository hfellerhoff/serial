import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { auth, isServerAuthed } from ".";
import type { ArticleFontFamily } from "~/lib/constants/article-fonts";
import { env } from "~/env";
import { FONT_FAMILY_CSS } from "~/lib/constants/article-fonts";
import { parseHSL } from "~/server/api/routers/hsl";
import { db } from "~/server/db";
import { userConfig } from "~/server/db/schema";

export const fetchIsForgotPasswordEnabled = createServerFn({
  method: "GET",
}).handler(async () => !!env.SENDGRID_API_KEY);

export const fetchIsAuthed = createServerFn({ method: "GET" }).handler(
  async () => {
    const request = getRequest();
    return isServerAuthed(request.headers);
  },
);

function hslToCssVars(
  prefix: "light" | "dark",
  dbValue: string | undefined,
): string | null {
  const parsed = parseHSL(dbValue);
  if (!parsed) return null;
  const [hue, sat, lgt] = parsed;
  return `--${prefix}-hue:${hue};--${prefix}-sat:${sat}%;--${prefix}-lgt:${lgt}%`;
}

export const fetchConfigCss = createServerFn({ method: "GET" }).handler(
  async () => {
    try {
      const { headers } = getRequest();
      const session = await auth.api.getSession({ headers });
      if (!session?.user?.id) return "";

      const config = await db
        .select()
        .from(userConfig)
        .where(eq(userConfig.userId, session.user.id))
        .get();

      if (!config) return "";

      const vars: string[] = [];

      const lightVars = hslToCssVars("light", config.lightHSL);
      if (lightVars) vars.push(lightVars);
      const darkVars = hslToCssVars("dark", config.darkHSL);
      if (darkVars) vars.push(darkVars);

      if (config.articleFontSize) {
        vars.push(`--article-font-size:${config.articleFontSize}`);
      }

      const fontFamilyKey = (config.articleFontFamily ??
        "sans-serif") as ArticleFontFamily;
      vars.push(
        `--article-font-family:${FONT_FAMILY_CSS[fontFamilyKey] ?? FONT_FAMILY_CSS["sans-serif"]}`,
      );

      return vars.length ? `:root{${vars.join(";")}}` : "";
    } catch {
      return "";
    }
  },
);

export const fetchAdminUserById = createServerFn({ method: "GET" })
  .inputValidator((userId: string) => userId)
  .handler(async ({ data: userId }) => {
    const request = getRequest();
    const headers = request.headers;

    // Verify the caller is an admin
    const session = await auth.api.getSession({ headers });
    if (!session?.user || session.user.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    const sessionsResult = await auth.api.listUserSessions({
      headers,
      body: { userId },
    });

    const allUsers = await auth.api.listUsers({
      headers,
      query: {
        limit: 1000,
        offset: 0,
      },
    });

    const user = allUsers.users.find((u) => u.id === userId);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      user,
      sessions: sessionsResult.sessions,
    };
  });
