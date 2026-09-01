import type { AuthProvider } from "~/lib/constants";
import { orderAuthProvidersForDisplay } from "~/lib/constants";

/**
 * The auth pages' method-layout model, shared by sign-in, sign-up, and the
 * first-admin bootstrap variant: which provider renders inline as the
 * primary method, which sit under the "or" divider as secondaries, and
 * which subscreen the routes' ?method= param opens. Kept out of the
 * component file (AuthMethodList) so the component module exports only
 * components.
 */

export type AuthIntent = "sign-in" | "sign-up";

/** A provider that opens as a subscreen rather than redirecting. */
export type SubscreenAuthProvider = Exclude<AuthProvider, "oauth">;

const INTENT_VERBS: Record<AuthIntent, string> = {
  "sign-in": "Sign in",
  "sign-up": "Sign up",
};

const SUBSCREEN_METHOD_NAMES: Record<SubscreenAuthProvider, string> = {
  email: "Email",
  atproto: "Atmosphere",
};

export function getAuthMethodLabel(
  intent: AuthIntent,
  provider: AuthProvider,
  oauthProviderName: string,
): string {
  const methodName =
    provider === "oauth" ? oauthProviderName : SUBSCREEN_METHOD_NAMES[provider];
  return `${INTENT_VERBS[intent]} with ${methodName}`;
}

export interface AuthMethodView {
  primary: AuthProvider | undefined;
  secondary: AuthProvider[];
  /** The subscreen the ?method= param opens, when it names a secondary. */
  openMethod: SubscreenAuthProvider | undefined;
}

/**
 * Resolve the page's method layout from the loader config plus the
 * ?method= param. A method param that does not name a secondary provider
 * (primary already, OAuth, or unavailable on this flow) falls back to the
 * main screen, so stale deep links and cross-flow links degrade safely.
 */
export function resolveAuthMethodView(options: {
  providers: AuthProvider[];
  isOAuthConfigured: boolean;
  method: AuthProvider | undefined;
}): AuthMethodView {
  const available = options.providers.filter(
    (provider) => provider !== "oauth" || options.isOAuthConfigured,
  );
  const [primary, ...secondary] = orderAuthProvidersForDisplay(available);
  const openMethod =
    options.method !== undefined &&
    options.method !== "oauth" &&
    secondary.includes(options.method)
      ? options.method
      : undefined;
  return { primary, secondary, openMethod };
}
