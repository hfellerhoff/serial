import { z } from "zod";
import { getPublicConfigKey } from "~/lib/public-config";

export const IS_MAIN_INSTANCE = getPublicConfigKey("PUBLIC_IS_MAIN_INSTANCE");

export const BASE_SIGNED_OUT_URL = "/auth/sign-in";

/** The public marketing website. */
export const MAIN_SITE_URL = "https://www.serial.tube";

export function getGuidesUrl(path = "") {
  return `${MAIN_SITE_URL}/guides${path}`;
}

export function getReleaseUrl(slug = "") {
  const path = slug ? `/${slug}` : "";
  return `${MAIN_SITE_URL}/releases${path}`;
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

export const authProviderSchema = z.enum(["email", "oauth", "atproto"]);
export type AuthProvider = z.infer<typeof authProviderSchema>;

/** Better Auth provider ID stored in the `account` table for email/password users */
export const CREDENTIAL_PROVIDER_ID = "credential";

/** Better Auth provider ID stored in the `account` table for AT Protocol users */
export const ATPROTO_PROVIDER_ID = "atproto";

/**
 * Per-user sign-in methods derived from account rows, counting only
 * providers this instance has configured (env-dependent, so supplied by
 * the caller). Named for its original caller, admin lockout accounting (a
 * sign-in method may not be disabled while it is some admin's only way
 * in); the connection unlink guard shares it for the same question about
 * any user. Pure so every guard shares one accounting of which account
 * rows count as which method.
 */
export function getAdminSigninMethods(options: {
  adminUserIds: string[];
  accountRows: Array<{ userId: string; providerId: string }>;
  /** The instance's OAuth provider id, or undefined when OAuth is not fully configured. */
  oauthProviderId: string | undefined;
  atprotoConfigured: boolean;
}): AuthProvider[][] {
  return options.adminUserIds.map((adminId) => {
    const rows = options.accountRows.filter((r) => r.userId === adminId);
    const methods: AuthProvider[] = [];
    if (rows.some((r) => r.providerId === CREDENTIAL_PROVIDER_ID)) {
      methods.push("email");
    }
    if (
      options.oauthProviderId &&
      rows.some((r) => r.providerId === options.oauthProviderId)
    ) {
      methods.push("oauth");
    }
    if (
      options.atprotoConfigured &&
      rows.some((r) => r.providerId === ATPROTO_PROVIDER_ID)
    ) {
      methods.push("atproto");
    }
    return methods;
  });
}

/**
 * Whether restricting the enabled set to `enabledProviders` would take away
 * some admin's only working sign-in method. Admins with no working method at all are
 * skipped: the setting can't lock them out further, and refusing on their
 * behalf would reject every change, including widening ones.
 */
export function wouldDisableSoleAdminSigninMethod(
  perAdminMethods: AuthProvider[][],
  enabledProviders: AuthProvider[],
): boolean {
  const enabled = new Set(enabledProviders);
  return perAdminMethods.some(
    (methods) =>
      methods.length > 0 && !methods.some((method) => enabled.has(method)),
  );
}

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
      (p: unknown): p is AuthProvider =>
        authProviderSchema.safeParse(p).success,
    );
  } catch {
    return DEFAULT_AUTH_PROVIDERS;
  }
}

/**
 * Single source of truth for computing which sign-up providers are currently
 * available, factoring in the public-signup toggle, the configured provider
 * list, which providers this instance has configured (env-dependent, so
 * supplied by the caller), and the first-user special case.
 */
export function getAvailableSignupProviders(opts: {
  isFirstUser: boolean;
  publicSignupEnabled: boolean;
  signupProvidersConfig: string | undefined | null;
  configuredProviders: AuthProvider[];
}): AuthProvider[] {
  const configured = new Set(opts.configuredProviders);
  if (opts.isFirstUser) {
    return authProviderSchema.options.filter((p) => configured.has(p));
  }
  if (!opts.publicSignupEnabled) return [];
  return getEnabledAuthProviders(opts.signupProvidersConfig).filter((p) =>
    configured.has(p),
  );
}
