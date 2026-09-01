import { ArrowLeftIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AuthProvider } from "~/lib/constants";
import { AtprotoAuthForm } from "~/components/auth/AtprotoAuthForm";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";
import { orderAuthProvidersForDisplay } from "~/lib/constants";

/**
 * The auth pages' shared method presentation: the highest-priority
 * available provider renders inline as the primary method — expanded by
 * default, so Atmosphere shows its handle field with no extra click — and
 * the rest sit under an "or" divider as secondary entries. Secondary email/Atmosphere
 * open a subscreen (driven by the routes' ?method= param) with a back
 * affordance matching the settings dialogs; secondary OAuth redirects
 * immediately. Shared by sign-in, sign-up, and the first-admin bootstrap
 * variant of sign-up.
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

function AuthMethodDivider() {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card text-muted-foreground px-2">or</span>
      </div>
    </div>
  );
}

function AuthBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm transition-colors"
    >
      <ArrowLeftIcon size={16} />
      <span>Back</span>
    </button>
  );
}

interface SecondaryMethodButtonProps {
  intent: AuthIntent;
  provider: AuthProvider;
  oauthProviderName: string;
  disabled: boolean;
  onOpenMethod: (method: SubscreenAuthProvider) => void;
  onOAuth: () => void;
}

function SecondaryMethodButton({
  intent,
  provider,
  oauthProviderName,
  disabled,
  onOpenMethod,
  onOAuth,
}: SecondaryMethodButtonProps) {
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      disabled={disabled}
      onClick={() =>
        provider === "oauth" ? onOAuth() : onOpenMethod(provider)
      }
    >
      {getAuthMethodLabel(intent, provider, oauthProviderName)}
    </Button>
  );
}

interface AuthMethodListProps {
  intent: AuthIntent;
  view: AuthMethodView;
  oauthProviderId: string;
  oauthProviderName: string;
  signedInDestination: string;
  /** The page's email submission state; disables every method entry. */
  disabled: boolean;
  /** The flow's own email form; field set and submit logic stay page-owned. */
  emailForm: ReactNode;
  /** Cross-flow link, rendered on the main screen and subscreens alike. */
  footer: ReactNode;
  onOpenMethod: (method: SubscreenAuthProvider) => void;
  onBack: () => void;
}

export function AuthMethodList({
  intent,
  view,
  oauthProviderId,
  oauthProviderName,
  signedInDestination,
  disabled,
  emailForm,
  footer,
  onOpenMethod,
  onBack,
}: AuthMethodListProps) {
  const [oauthRedirecting, setOauthRedirecting] = useState(false);
  const methodsDisabled = disabled || oauthRedirecting;

  const startOAuth = async () => {
    setOauthRedirecting(true);
    await authClient.signIn.oauth2({
      providerId: oauthProviderId,
      callbackURL: signedInDestination,
    });
  };

  if (view.openMethod) {
    return (
      <div className="grid gap-4">
        <AuthBackButton onClick={onBack} />
        {view.openMethod === "email" ? (
          emailForm
        ) : (
          <AtprotoAuthForm disabled={disabled} focusOnMount />
        )}
        {footer}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {view.primary === "email" && emailForm}
      {view.primary === "atproto" && (
        <AtprotoAuthForm disabled={methodsDisabled} />
      )}
      {view.primary === "oauth" && (
        <Button
          size="lg"
          className="w-full"
          disabled={methodsDisabled}
          onClick={() => void startOAuth()}
        >
          {oauthRedirecting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            getAuthMethodLabel(intent, "oauth", oauthProviderName)
          )}
        </Button>
      )}

      {view.secondary.length > 0 && <AuthMethodDivider />}

      {view.secondary.map((provider) => (
        <SecondaryMethodButton
          key={provider}
          intent={intent}
          provider={provider}
          oauthProviderName={oauthProviderName}
          disabled={methodsDisabled}
          onOpenMethod={onOpenMethod}
          onOAuth={() => void startOAuth()}
        />
      ))}

      {footer}
    </div>
  );
}
