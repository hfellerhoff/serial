import { z } from "zod";

const optionalString = <TSchema extends z.ZodType<string>>(schema: TSchema) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

const optionalBoolean = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.union([z.boolean(), z.stringbool()]).optional().default(false),
);

export const publicConfigSchema = z.object({
  PUBLIC_BASE_URL: z.url(),
  PUBLIC_SUPPORT_EMAIL_ADDRESS: optionalString(z.email()),
  PUBLIC_SENTRY_DSN_WEB: optionalString(z.url()),
  PUBLIC_UMAMI_WEBSITE_ID: optionalString(z.string()),
  PUBLIC_UMAMI_SRC: optionalString(z.url()),
  PUBLIC_IS_MAINTENANCE_MODE: optionalBoolean,
  PUBLIC_IS_MAIN_INSTANCE: optionalBoolean,
  PUBLIC_IS_DEMO_INSTANCE: optionalBoolean,
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

const PUBLIC_ENV_KEYS = {
  BASE_URL: {
    canonical: "PUBLIC_BASE_URL",
    legacy: "VITE_PUBLIC_BASE_URL",
  },
  SUPPORT_EMAIL_ADDRESS: {
    canonical: "PUBLIC_SUPPORT_EMAIL_ADDRESS",
    legacy: "VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS",
  },
  SENTRY_DSN_WEB: {
    canonical: "PUBLIC_SENTRY_DSN_WEB",
    legacy: "VITE_PUBLIC_SENTRY_DSN_WEB",
  },
  UMAMI_WEBSITE_ID: {
    canonical: "PUBLIC_UMAMI_WEBSITE_ID",
    legacy: "VITE_PUBLIC_UMAMI_WEBSITE_ID",
  },
  UMAMI_SRC: {
    canonical: "PUBLIC_UMAMI_SRC",
    legacy: "VITE_PUBLIC_UMAMI_SRC",
  },
  IS_MAINTENANCE_MODE: {
    canonical: "PUBLIC_IS_MAINTENANCE_MODE",
    legacy: "VITE_PUBLIC_IS_MAINTENANCE_MODE",
  },
  IS_MAIN_INSTANCE: {
    canonical: "PUBLIC_IS_MAIN_INSTANCE",
    legacy: "VITE_PUBLIC_IS_MAIN_INSTANCE",
  },
  IS_DEMO_INSTANCE: {
    canonical: "PUBLIC_IS_DEMO_INSTANCE",
    legacy: "VITE_PUBLIC_IS_DEMO_INSTANCE",
  },
} as const;

function readPublicEnvValue(
  runtimeEnv: Record<string, unknown>,
  envKeys: { canonical: string; legacy: string },
): string | boolean | undefined {
  const canonicalValue = runtimeEnv[envKeys.canonical];
  const isCanonicalValueSupported =
    typeof canonicalValue === "string" || typeof canonicalValue === "boolean";
  if (isCanonicalValueSupported && canonicalValue !== "") {
    return canonicalValue;
  }

  const legacyValue = runtimeEnv[envKeys.legacy];
  if (typeof legacyValue === "string" || typeof legacyValue === "boolean") {
    return legacyValue;
  }

  return undefined;
}

export function getPublicConfigEnv(
  runtimeEnv: Record<string, unknown>,
): Record<keyof PublicConfig, string | boolean | undefined> {
  return {
    PUBLIC_BASE_URL: readPublicEnvValue(runtimeEnv, PUBLIC_ENV_KEYS.BASE_URL),
    PUBLIC_SUPPORT_EMAIL_ADDRESS: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.SUPPORT_EMAIL_ADDRESS,
    ),
    PUBLIC_SENTRY_DSN_WEB: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.SENTRY_DSN_WEB,
    ),
    PUBLIC_UMAMI_WEBSITE_ID: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.UMAMI_WEBSITE_ID,
    ),
    PUBLIC_UMAMI_SRC: readPublicEnvValue(runtimeEnv, PUBLIC_ENV_KEYS.UMAMI_SRC),
    PUBLIC_IS_MAINTENANCE_MODE: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.IS_MAINTENANCE_MODE,
    ),
    PUBLIC_IS_MAIN_INSTANCE: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.IS_MAIN_INSTANCE,
    ),
    PUBLIC_IS_DEMO_INSTANCE: readPublicEnvValue(
      runtimeEnv,
      PUBLIC_ENV_KEYS.IS_DEMO_INSTANCE,
    ),
  };
}

export function resolvePublicConfig(
  runtimeEnv: Record<string, unknown>,
): PublicConfig {
  return publicConfigSchema.parse(getPublicConfigEnv(runtimeEnv));
}

type PublicConfigWindow = Window & {
  __SERIAL_PUBLIC_CONFIG__?: PublicConfig;
};

export function getBrowserPublicConfig(): PublicConfig {
  const publicConfig = (window as PublicConfigWindow).__SERIAL_PUBLIC_CONFIG__;

  if (!publicConfig) {
    throw new Error("Serial public configuration was not initialized.");
  }

  return publicConfig;
}

export function serializePublicConfig(publicConfig: PublicConfig): string {
  return JSON.stringify(publicConfig)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
