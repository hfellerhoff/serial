import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const optionalBoolean = z.union([z.boolean(), z.stringbool()]).default(false);

const shouldSkipEnvValidation =
  process.env.SKIP_ENV_VALIDATION === "true" &&
  process.env.NODE_ENV !== "production";

const PUBLIC_ENV_SCHEMA = {
  PUBLIC_BASE_URL: z.url(),
  PUBLIC_SUPPORT_EMAIL_ADDRESS: z.email().optional(),
  PUBLIC_SENTRY_DSN_WEB: z.url().optional(),
  PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  PUBLIC_UMAMI_SRC: z.url().optional(),
  PUBLIC_IS_MAINTENANCE_MODE: optionalBoolean,
  PUBLIC_IS_MAIN_INSTANCE: optionalBoolean,
};

const PUBLIC_ENV_KEYS = /** @type {(keyof typeof PUBLIC_ENV_SCHEMA)[]} */ (
  Object.keys(PUBLIC_ENV_SCHEMA)
);

const publicRuntimeEnv = Object.fromEntries(
  PUBLIC_ENV_KEYS.map((key) => {
    const canonicalValue = process.env[key];

    const publicValue =
      canonicalValue === undefined || canonicalValue === ""
        ? process.env[`VITE_${key}`]
        : canonicalValue;

    return [key, publicValue];
  }),
);

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: PUBLIC_ENV_SCHEMA,
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
    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    FROM_EMAIL_ADDRESS: z.email().optional(),
    INSTAPAPER_OAUTH_ID: z.string().optional(),
    INSTAPAPER_OAUTH_SECRET: z.string().optional(),
    POLAR_ACCESS_TOKEN: z.string().optional(),
    POLAR_WEBHOOK_SECRET: z.string().optional(),
    POLAR_STANDARD_SMALL_QUOTA_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_SMALL_QUOTA_ANNUAL_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_MEDIUM_QUOTA_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_MEDIUM_QUOTA_ANNUAL_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_LARGE_QUOTA_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_STANDARD_LARGE_QUOTA_ANNUAL_PRODUCT_ID: z.string().optional(),
    POLAR_PRO_MONTHLY_PRODUCT_ID: z.string().optional(),
    POLAR_PRO_ANNUAL_PRODUCT_ID: z.string().optional(),
    POLAR_ENVIRONMENT: z.enum(["production", "sandbox"]).optional(),
    KV_STORE: z.enum(["none", "ioredis", "upstash"]).default("none"),
    UPSTASH_REDIS_REST_URL: z
      .string()
      .optional()
      .refine(
        (val) => !(process.env.KV_STORE === "upstash" && !val),
        "UPSTASH_REDIS_REST_URL is required when KV_STORE is 'upstash'.",
      ),
    UPSTASH_REDIS_REST_TOKEN: z
      .string()
      .optional()
      .refine(
        (val) => !(process.env.KV_STORE === "upstash" && !val),
        "UPSTASH_REDIS_REST_TOKEN is required when KV_STORE is 'upstash'.",
      ),
    REDIS_URL: z
      .string()
      .optional()
      .refine(
        (val) => !(process.env.KV_STORE === "ioredis" && !val),
        "REDIS_URL is required when KV_STORE is 'ioredis'.",
      ),
    BACKGROUND_REFRESH_ENABLED: z.stringbool().optional().default(true),
    OAUTH_PROVIDER_ID: z.string().optional(),
    OAUTH_PROVIDER_NAME: z.string().optional(),
    OAUTH_CLIENT_ID: z.string().optional(),
    OAUTH_CLIENT_SECRET: z.string().optional(),
    OAUTH_DISCOVERY_URL: z.string().optional(),
    OAUTH_AUTHORIZATION_URL: z.string().optional(),
    OAUTH_TOKEN_URL: z.string().optional(),
    OAUTH_USER_INFO_URL: z.string().optional(),
    OAUTH_SCOPES: z.string().optional(),
    OAUTH_PKCE: z.stringbool().optional(),
    OAUTH_REDIRECT_URI: z.string().optional(),
    SERIAL_EXTENSION_REDIRECT_URIS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((uri) => uri.trim())
              .filter(Boolean)
          : [],
      ),
    TRUSTED_ORIGINS: z
      .string()
      .optional()
      .transform((val) => {
        const origins = val
          ? val
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        for (const origin of origins) {
          try {
            new URL(origin);
          } catch {
            throw new Error(`Invalid trusted origin URL: ${origin}`);
          }
        }
        return origins;
      }),
    SENTRY_DSN_BACKEND: z.url().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    LOG_LEVEL: z
      .enum(["error", "warning", "info", "debug"])
      .optional()
      .default("info"),
    /**
     * When set (e.g. ".serial.tube"), the auth session cookie is shared
     * across subdomains so the marketing site can detect signed-in users.
     */
    COOKIE_DOMAIN: z.string().optional(),
  },
  runtimeEnv: {
    ...publicRuntimeEnv,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    FROM_EMAIL_ADDRESS: process.env.FROM_EMAIL_ADDRESS,
    INSTAPAPER_OAUTH_ID: process.env.INSTAPAPER_OAUTH_ID,
    INSTAPAPER_OAUTH_SECRET: process.env.INSTAPAPER_OAUTH_SECRET,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_STANDARD_SMALL_QUOTA_MONTHLY_PRODUCT_ID:
      process.env.POLAR_STANDARD_SMALL_QUOTA_MONTHLY_PRODUCT_ID,
    POLAR_STANDARD_SMALL_QUOTA_ANNUAL_PRODUCT_ID:
      process.env.POLAR_STANDARD_SMALL_QUOTA_ANNUAL_PRODUCT_ID,
    POLAR_STANDARD_MEDIUM_QUOTA_MONTHLY_PRODUCT_ID:
      process.env.POLAR_STANDARD_MEDIUM_QUOTA_MONTHLY_PRODUCT_ID,
    POLAR_STANDARD_MEDIUM_QUOTA_ANNUAL_PRODUCT_ID:
      process.env.POLAR_STANDARD_MEDIUM_QUOTA_ANNUAL_PRODUCT_ID,
    POLAR_STANDARD_LARGE_QUOTA_MONTHLY_PRODUCT_ID:
      process.env.POLAR_STANDARD_LARGE_QUOTA_MONTHLY_PRODUCT_ID,
    POLAR_STANDARD_LARGE_QUOTA_ANNUAL_PRODUCT_ID:
      process.env.POLAR_STANDARD_LARGE_QUOTA_ANNUAL_PRODUCT_ID,
    POLAR_PRO_MONTHLY_PRODUCT_ID: process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
    POLAR_PRO_ANNUAL_PRODUCT_ID: process.env.POLAR_PRO_ANNUAL_PRODUCT_ID,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
    KV_STORE: process.env.KV_STORE,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_URL: process.env.REDIS_URL,
    BACKGROUND_REFRESH_ENABLED: process.env.BACKGROUND_REFRESH_ENABLED,
    OAUTH_PROVIDER_ID: process.env.OAUTH_PROVIDER_ID,
    OAUTH_PROVIDER_NAME: process.env.OAUTH_PROVIDER_NAME,
    OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
    OAUTH_DISCOVERY_URL: process.env.OAUTH_DISCOVERY_URL,
    OAUTH_AUTHORIZATION_URL: process.env.OAUTH_AUTHORIZATION_URL,
    OAUTH_TOKEN_URL: process.env.OAUTH_TOKEN_URL,
    OAUTH_USER_INFO_URL: process.env.OAUTH_USER_INFO_URL,
    OAUTH_SCOPES: process.env.OAUTH_SCOPES,
    OAUTH_PKCE: process.env.OAUTH_PKCE,
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI,
    SERIAL_EXTENSION_REDIRECT_URIS: process.env.SERIAL_EXTENSION_REDIRECT_URIS,
    TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS,
    SENTRY_DSN_BACKEND: process.env.SENTRY_DSN_BACKEND,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  },
  /**
   * Allow local tooling to skip validation without permitting unparsed values
   * such as the string "false" to reach production consumers.
   */
  skipValidation: shouldSkipEnvValidation,
  /**
   * Makes it so that empty strings are treated as undefined.
   * `SOME_VAR: z.string()` and `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
