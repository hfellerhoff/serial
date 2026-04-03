import { Polar } from "@polar-sh/sdk";
import { IS_MAIN_INSTANCE } from "~/lib/constants";

const REQUIRED_POLAR_ENV_VARS = [
  "POLAR_ACCESS_TOKEN",
  "POLAR_WEBHOOK_SECRET",
  "POLAR_STANDARD_MONTHLY_PRODUCT_ID",
  "POLAR_STANDARD_ANNUAL_PRODUCT_ID",
  "POLAR_PRO_MONTHLY_PRODUCT_ID",
  "POLAR_PRO_ANNUAL_PRODUCT_ID",
] as const;

function hasAllPolarCredentials(): boolean {
  return REQUIRED_POLAR_ENV_VARS.every((key) => !!process.env[key]);
}

export const polarClient =
  IS_MAIN_INSTANCE && hasAllPolarCredentials()
    ? new Polar({
        accessToken: process.env.POLAR_ACCESS_TOKEN!,
        server:
          process.env.NODE_ENV === "production" ? "production" : "sandbox",
      })
    : null;

/** True only when running as the main instance with all Polar credentials configured. */
export const IS_BILLING_ENABLED = polarClient !== null;
