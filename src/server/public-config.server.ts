import SuperJSON from "superjson";
import { env } from "~/env";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

export function getServerPublicConfig() {
  return {
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
    PUBLIC_SUPPORT_EMAIL_ADDRESS: env.PUBLIC_SUPPORT_EMAIL_ADDRESS,
    PUBLIC_SENTRY_DSN_WEB: env.PUBLIC_SENTRY_DSN_WEB,
    PUBLIC_UMAMI_WEBSITE_ID: env.PUBLIC_UMAMI_WEBSITE_ID,
    PUBLIC_UMAMI_SRC: env.PUBLIC_UMAMI_SRC,
    PUBLIC_IS_MAINTENANCE_MODE: env.PUBLIC_IS_MAINTENANCE_MODE,
    PUBLIC_IS_MAIN_INSTANCE: env.PUBLIC_IS_MAIN_INSTANCE,
    PUBLIC_IS_DEMO_INSTANCE: IS_DEMO_INSTANCE,
  };
}

export function serializePublicConfigForInlineScript(
  publicConfig: ReturnType<typeof getServerPublicConfig>,
): string {
  return JSON.stringify(SuperJSON.stringify(publicConfig))
    .replaceAll("<", "\\u003c")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function getServerPublicConfigPayload() {
  const publicConfig = getServerPublicConfig();

  return {
    publicConfig,
    inlinePublicConfig: serializePublicConfigForInlineScript(publicConfig),
  };
}
