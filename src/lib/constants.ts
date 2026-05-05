import { z } from "zod";

export const IS_MAIN_INSTANCE =
  String(import.meta.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true" ||
  String(process.env.VITE_PUBLIC_IS_MAIN_INSTANCE) === "true";

export const BASE_SIGNED_OUT_URL = IS_MAIN_INSTANCE
  ? "/welcome"
  : "/auth/sign-in";

export function getGuidesUrl(path = "") {
  if (IS_MAIN_INSTANCE) return `/guides${path}`;
  return `https://serial.tube/guides${path}`;
}

/**
 * Parse the public signup config value consistently.
 * Default: signups are ENABLED if not explicitly set to "true"
 */
export function isPublicSignupEnabled(
  configValue: string | undefined | null,
): boolean {
  return configValue === "true";
}

export const authProviderSchema = z.enum(["email", "oauth"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

/** Better Auth provider ID stored in the `account` table for email/password users */
export const CREDENTIAL_PROVIDER_ID = "credential";

const DEFAULT_AUTH_PROVIDERS: AuthProvider[] = ["email"];

/**
 * Parse the enabled-auth-providers config value.
 * Returns the list of enabled auth providers for sign-up.
 * Default: ["email"]
 */
export function getEnabledAuthProviders(
  configValue: string | undefined | null,
): AuthProvider[] {
  if (!configValue) return DEFAULT_AUTH_PROVIDERS;
  try {
    const parsed = JSON.parse(configValue);
    if (!Array.isArray(parsed)) return DEFAULT_AUTH_PROVIDERS;
    return parsed.filter(
      (p: unknown): p is AuthProvider => p === "email" || p === "oauth",
    );
  } catch {
    return DEFAULT_AUTH_PROVIDERS;
  }
}

/**
 * Single source of truth for computing which sign-up providers are currently
 * available, factoring in the public-signup toggle, the configured provider
 * list, whether OAuth env vars are present, and the first-user special case.
 */
export function getAvailableSignupProviders(opts: {
  isFirstUser: boolean;
  publicSignupEnabled: boolean;
  signupProvidersConfig: string | undefined | null;
  oauthConfigured: boolean;
}): AuthProvider[] {
  if (opts.isFirstUser) {
    const providers: AuthProvider[] = ["email"];
    if (opts.oauthConfigured) providers.push("oauth");
    return providers;
  }
  if (!opts.publicSignupEnabled) return [];
  const providers = getEnabledAuthProviders(opts.signupProvidersConfig);
  return opts.oauthConfigured
    ? providers
    : providers.filter((p) => p !== "oauth");
}
