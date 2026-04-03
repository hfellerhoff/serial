import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.url().optional().default("http://127.0.0.1:8080"),
    DATABASE_AUTH_TOKEN: z
      .string()
      .optional()
      .refine(
        (str) => !(!!str && process.env.DATABASE_URL?.includes("https://")),
        "A DATABASE_AUTH_TOKEN is needed.",
      ),
    BETTER_AUTH_SECRET: z.string(),
    SENDGRID_API_KEY: z.string().optional(),
    INSTAPAPER_OAUTH_ID: z.string().optional(),
    INSTAPAPER_OAUTH_SECRET: z.string().optional(),
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    POLAR_STANDARD_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_ANNUAL_PRODUCT_ID: z.string().optional(),
    POLAR_PRO_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_PRO_ANNUAL_PRODUCT_ID: z.string().optional(),
    BACKGROUND_REFRESH_ENABLED: z.string().optional().default("true"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    INSTAPAPER_OAUTH_ID: process.env.INSTAPAPER_OAUTH_ID,
    INSTAPAPER_OAUTH_SECRET: process.env.INSTAPAPER_OAUTH_SECRET,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_STANDARD_MONTHLY_PRODUCT_ID:
      process.env.POLAR_STANDARD_MONTHLY_PRODUCT_ID,
    POLAR_STANDARD_ANNUAL_PRODUCT_ID:
      process.env.POLAR_STANDARD_ANNUAL_PRODUCT_ID,
    POLAR_PRO_MONTHLY_PRODUCT_ID: process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
    POLAR_PRO_ANNUAL_PRODUCT_ID: process.env.POLAR_PRO_ANNUAL_PRODUCT_ID,
    BACKGROUND_REFRESH_ENABLED: process.env.BACKGROUND_REFRESH_ENABLED,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined.
   * `SOME_VAR: z.string()` and `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
