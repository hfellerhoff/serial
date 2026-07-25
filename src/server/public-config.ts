import { createServerFn } from "@tanstack/react-start";
import { env } from "~/env";

export function getServerPublicConfig() {
  const isDemoInstance =
    typeof __SERIAL_DEMO_BUILD__ === "boolean"
      ? __SERIAL_DEMO_BUILD__
      : env.PUBLIC_IS_DEMO_INSTANCE;

  return {
    PUBLIC_BASE_URL: env.PUBLIC_BASE_URL,
    PUBLIC_SUPPORT_EMAIL_ADDRESS: env.PUBLIC_SUPPORT_EMAIL_ADDRESS,
    PUBLIC_SENTRY_DSN_WEB: env.PUBLIC_SENTRY_DSN_WEB,
    PUBLIC_UMAMI_WEBSITE_ID: env.PUBLIC_UMAMI_WEBSITE_ID,
    PUBLIC_UMAMI_SRC: env.PUBLIC_UMAMI_SRC,
    PUBLIC_IS_MAINTENANCE_MODE: env.PUBLIC_IS_MAINTENANCE_MODE,
    PUBLIC_IS_MAIN_INSTANCE: env.PUBLIC_IS_MAIN_INSTANCE,
    PUBLIC_IS_DEMO_INSTANCE: isDemoInstance,
  };
}

export const fetchPublicConfig = createServerFn({ method: "GET" }).handler(
  getServerPublicConfig,
);
