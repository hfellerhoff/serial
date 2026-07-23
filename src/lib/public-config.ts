import { z } from "zod";

const optionalString = <TSchema extends z.ZodType<string>>(schema: TSchema) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    schema.optional(),
  );

const optionalBooleanString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.enum(["true", "false"]).optional().default("false"),
);

export const publicConfigSchema = z.object({
  VITE_PUBLIC_BASE_URL: z.url(),
  VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS: optionalString(z.email()),
  VITE_PUBLIC_SENTRY_DSN_WEB: optionalString(z.url()),
  VITE_PUBLIC_UMAMI_WEBSITE_ID: optionalString(z.string()),
  VITE_PUBLIC_UMAMI_SRC: optionalString(z.url()),
  VITE_PUBLIC_IS_MAINTENANCE_MODE: optionalBooleanString,
  VITE_PUBLIC_IS_MAIN_INSTANCE: optionalBooleanString,
  VITE_PUBLIC_IS_DEMO_INSTANCE: optionalBooleanString,
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

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
