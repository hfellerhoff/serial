import { render } from "react-email";
import { betterAuth } from "better-auth";
import { admin, emailOTP, genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { createAuthMiddleware } from "better-auth/api";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { db } from "../db";
import {
  getPolarProductIds,
  IS_BILLING_ENABLED,
  polarClient,
} from "../subscriptions/polar";
import { PLANS } from "../subscriptions/plans";
import {
  applySubscriptionSideEffects,
  syncPolarDataToKV,
} from "../subscriptions/kv";
import type { AuthAttempt, CompletedAuth } from "~/server/auth/policy";
import ResetPasswordEmail from "~/emails/reset-password";
import VerifyEmailEmail from "~/emails/verify-email";
import VerifyEmailChangeEmail from "~/emails/verify-email-change";
import { BASE_SIGNED_OUT_URL } from "~/lib/constants";
import {
  isAtprotoConfigured,
  isOAuthConfigured,
  TRUSTED_ORIGINS_SET,
} from "~/server/auth/constants";
import { atprotoPlugin } from "~/server/auth/atproto/plugin";
import { createKvRateLimitStorage } from "~/server/auth/rate-limit-storage";
import {
  refreshEmailVerificationExempt,
  requiresEmailVerification,
} from "~/server/auth/email-verification-policy";
import {
  applyPostAuthPolicy,
  enforceAuthAttemptPolicy,
} from "~/server/auth/policy";
import { IS_EMAIL_ENABLED, sendEmail } from "~/server/email";
import { setOtpCooldown } from "~/server/otp";
import { captureException, logError, logMessage } from "~/server/logger";
import { env } from "~/env";
import { IS_DEMO_INSTANCE } from "~/lib/demo";
import { getExtensionConnectCallbackFromRequestUrl } from "~/lib/extension-auth";

const SIGNED_IN_REDIRECT_AUTH_PATHS = [
  "/auth",
  "/auth/sign-in",
  "/auth/sign-up",
];

export const authMiddleware = createMiddleware().server(
  async ({ pathname, request, next }) => {
    const headers = request.headers;
    const session = await auth.api.getSession({ headers });

    // Demo mode: auto-provision unauthenticated users and keep authed users
    // away from auth pages.
    if (IS_DEMO_INSTANCE) {
      if (!session) {
        if (
          !pathname.startsWith("/api/") &&
          pathname !== "/api/demo/provision"
        ) {
          throw redirect({ to: "/api/demo/provision" });
        }
      } else if (SIGNED_IN_REDIRECT_AUTH_PATHS.includes(pathname)) {
        throw redirect({ to: "/" });
      }
    }

    // Signed-in users have no business on the sign-in/sign-up pages —
    // send them into the app instead of showing them an auth form.
    const isSignedInOnAuthEntryPage =
      !!session && SIGNED_IN_REDIRECT_AUTH_PATHS.includes(pathname);
    if (isSignedInOnAuthEntryPage) {
      throw redirect({ to: "/" });
    }

    if (!session) {
      if (!pathname.startsWith("/auth/") && pathname !== "/auth") {
        throw redirect({ to: BASE_SIGNED_OUT_URL });
      }
    }

    // Redirect unverified credential users to the verification page; users
    // without an email + password account are exempt (see requiresEmailVerification).
    // Preserve a valid extension connection callback so verification can
    // resume that flow.
    if (
      IS_EMAIL_ENABLED &&
      session &&
      pathname !== "/auth/verify-email" &&
      !pathname.startsWith("/api/auth/") &&
      requiresEmailVerification(session.user)
    ) {
      const callbackURL = getExtensionConnectCallbackFromRequestUrl(
        request.url,
      );
      throw redirect({
        to: "/auth/verify-email",
        search: { callbackURL: callbackURL ?? undefined },
      });
    }

    return await next();
  },
);

export const adminMiddleware = createMiddleware().server(async ({ next }) => {
  const headers = getRequestHeaders() as Headers;
  const session = await auth.api.getSession({ headers });

  if (session?.user.role !== "admin") {
    throw redirect({ to: "/" });
  }

  return await next();
});

async function syncAndApply(userId: string) {
  try {
    const data = await syncPolarDataToKV(userId);
    await applySubscriptionSideEffects(db, userId, data);
  } catch (e) {
    captureException(e);
    logError(
      `[polar webhook] Failed to sync subscription for user ${userId}:`,
      e,
    );
  }
}

async function handleSubscriptionWebhook(payload: {
  data: { customer?: { externalId?: string | null } | null };
}) {
  const userId = payload.data.customer?.externalId;
  if (!userId) return;
  await syncAndApply(userId);
}

async function handleCustomerStateChanged(payload: {
  data: { externalId?: string | null };
}) {
  const userId = payload.data.externalId;
  if (!userId) return;
  await syncAndApply(userId);
}

function buildPolarPlugin() {
  if (!polarClient) return [];
  if (!env.POLAR_WEBHOOK_SECRET) return [];

  // Build products list from plan config — each plan can have a monthly and/or annual product.
  const products = Object.values(PLANS).flatMap((plan) => {
    const productIds = getPolarProductIds(plan.id);
    const entries: Array<{ productId: string; slug: string }> = [];
    if (productIds.monthly) {
      entries.push({
        productId: productIds.monthly,
        slug: `${plan.id}-monthly`,
      });
    }
    if (productIds.annual) {
      entries.push({ productId: productIds.annual, slug: `${plan.id}-annual` });
    }
    return entries;
  });

  return [
    polar({
      client: polarClient,
      createCustomerOnSignUp: false,
      use: [
        checkout({
          products,
          successUrl: "/?checkout_success=true",
          authenticatedUsersOnly: true,
        }),
        portal(),
        webhooks({
          secret: env.POLAR_WEBHOOK_SECRET ?? "",
          onSubscriptionCreated: handleSubscriptionWebhook,
          onSubscriptionUpdated: handleSubscriptionWebhook,
          onSubscriptionActive: handleSubscriptionWebhook,
          onSubscriptionCanceled: handleSubscriptionWebhook,
          onSubscriptionRevoked: handleSubscriptionWebhook,
          onSubscriptionUncanceled: handleSubscriptionWebhook,
          onCustomerStateChanged: handleCustomerStateChanged,
        }),
      ],
    }),
  ];
}

function buildGenericOAuthPlugin() {
  if (!isOAuthConfigured()) return [];

  return [
    genericOAuth({
      config: [
        {
          providerId: env.OAUTH_PROVIDER_ID!,
          clientId: env.OAUTH_CLIENT_ID!,
          clientSecret: env.OAUTH_CLIENT_SECRET!,
          discoveryUrl: env.OAUTH_DISCOVERY_URL,
          authorizationUrl: env.OAUTH_AUTHORIZATION_URL,
          tokenUrl: env.OAUTH_TOKEN_URL,
          userInfoUrl: env.OAUTH_USER_INFO_URL,
          scopes: env.OAUTH_SCOPES?.split(" ") ?? undefined,
          pkce: env.OAUTH_PKCE,
          redirectURI: env.OAUTH_REDIRECT_URI,
        },
      ],
    }),
  ];
}

function buildAtprotoPlugin() {
  if (!isAtprotoConfigured()) return [];
  return [atprotoPlugin()];
}

// Classify a Better Auth request path into the explicit provider identity
// and intent the shared policy service consumes. OAuth-style providers
// (generic OAuth, atproto) gate as sign-in for both the start and callback
// paths; disallowed auto-signups are rolled back by the post-auth policy
// instead.
function classifyAuthRequest(
  path: string,
): Pick<AuthAttempt, "provider" | "intent"> | undefined {
  if (path.startsWith("/sign-up")) {
    return { provider: "email", intent: "sign-up" };
  }
  if (path === "/sign-in/email") {
    return { provider: "email", intent: "sign-in" };
  }
  if (
    path.startsWith("/sign-in/oauth2") ||
    path.startsWith("/oauth2/callback/")
  ) {
    return { provider: "oauth", intent: "sign-in" };
  }
  if (path === "/atproto/authorize" || path === "/atproto/callback") {
    return { provider: "atproto", intent: "sign-in" };
  }
  return undefined;
}

// Classify a Better Auth request path into the completed-flow identity the
// post-auth policy consumes. Only sign-up-capable paths return a value:
// email sign-up creates a user directly, and the OAuth callback may have
// auto-created one.
function classifyCompletedAuth(
  path: string,
): Pick<CompletedAuth, "provider" | "flow"> | undefined {
  if (path.startsWith("/sign-up")) {
    return { provider: "email", flow: "sign-up" };
  }
  if (path.startsWith("/oauth2/callback/")) {
    return { provider: "oauth", flow: "callback" };
  }
  if (path === "/atproto/callback") {
    return { provider: "atproto", flow: "callback" };
  }
  return undefined;
}

// ctx.body is unvalidated request input; only pass the token through when it
// is actually a string.
function getInvitationToken(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const token = (body as Record<string, unknown>).invitationToken;
  return typeof token === "string" ? token : undefined;
}

export const auth = betterAuth({
  baseURL: env.PUBLIC_BASE_URL,
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  trustedOrigins: Array.from(TRUSTED_ORIGINS_SET),
  /**
   * Abuse ceilings, not precision throttles: a lax global bound on the
   * whole auth surface, with stricter per-path rules on the atproto
   * endpoints (declared by that plugin) because authorize fans out to
   * outbound identity resolution. Storage is KV-backed — shared when Redis
   * is configured, per-process otherwise. Buckets are keyed per client IP
   * and path; behind a reverse proxy, TRUSTED_PROXIES must list the proxy
   * addresses so the forwarded chain resolves to the real client instead
   * of collapsing every request into one shared bucket.
   */
  rateLimit: {
    // Production only (Better Auth's own default): dev and unit-test
    // traffic shares one IP-less bucket and would trip any real ceiling.
    enabled: env.NODE_ENV === "production",
    window: 60,
    max: 120,
    customStorage: createKvRateLimitStorage(),
    customRules: {
      // Replace Better Auth's built-in 3-per-10s specials with Serial's
      // lax-ceiling posture; parallel e2e workers share one IP and would
      // trip the defaults.
      "/sign-in/**": { window: 60, max: 60 },
      "/sign-up/**": { window: 60, max: 60 },
    },
  },
  advanced: {
    ...(env.COOKIE_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.COOKIE_DOMAIN,
          },
        }
      : {}),
    ...(env.TRUSTED_PROXIES.length > 0
      ? { ipAddress: { trustedProxies: env.TRUSTED_PROXIES } }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
    maxPasswordLength: 64,
    async sendResetPassword(data) {
      try {
        const html = await render(
          <ResetPasswordEmail
            resetUrl={data.url}
            supportEmail={env.PUBLIC_SUPPORT_EMAIL_ADDRESS}
          />,
        );

        await sendEmail({
          to: data.user.email,
          subject: "Reset your password for Serial",
          html,
        });
        logMessage(`[auth] Reset password email sent to ${data.user.email}`);
      } catch (error) {
        logError(
          `[auth] Failed to send reset password email to ${data.user.email}:`,
          error,
        );
        throw error;
      }
    },
  },
  user: {
    additionalFields: {
      emailVerificationExempt: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
      // Deleting the user cascades the atproto connection row away along
      // with the encrypted refresh token — the only credential that can
      // revoke the PDS-side grant — so revoke first, best-effort.
      async beforeDelete(user) {
        if (!isAtprotoConfigured()) return;
        const { revokeAtprotoGrantsForUser } =
          await import("~/server/auth/atproto/service");
        await revokeAtprotoGrantsForUser(user.id);
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const html = await render(
          <VerifyEmailChangeEmail
            verificationUrl={url}
            supportEmail={env.PUBLIC_SUPPORT_EMAIL_ADDRESS}
          />,
        );

        void sendEmail({
          to: user.email,
          subject: "Verify your new email for Serial",
          html,
        });
        logMessage(`[auth] Email change verification sent to ${user.email}`);
      } catch (error) {
        logError(
          `[auth] Failed to send email change verification to ${user.email}:`,
          error,
        );
        throw error;
      }
    },
  },
  plugins: [
    admin(),
    tanstackStartCookies(),
    ...buildPolarPlugin(),
    ...buildGenericOAuthPlugin(),
    ...buildAtprotoPlugin(),
    ...(IS_EMAIL_ENABLED
      ? [
          emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
              if (type === "email-verification") {
                await setOtpCooldown(email);

                try {
                  const html = await render(
                    <VerifyEmailEmail
                      otp={otp}
                      supportEmail={env.PUBLIC_SUPPORT_EMAIL_ADDRESS}
                    />,
                  );
                  await sendEmail({
                    to: email,
                    subject: "Verify your email for Serial",
                    html,
                  });
                  logMessage(`[auth] Verification email sent to ${email}`);
                } catch (error) {
                  logError(
                    `[auth] Failed to send verification email to ${email}:`,
                    error,
                  );
                  throw error;
                }
              }
            },
            sendVerificationOnSignUp: true,
          }),
        ]
      : []),
  ],

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const attempt = classifyAuthRequest(ctx.path);
      if (!attempt) return;

      await enforceAuthAttemptPolicy({
        ...attempt,
        invitationToken: getInvitationToken(ctx.body),
      });
    }),
    after: createAuthMiddleware(async (ctx) => {
      const completed = classifyCompletedAuth(ctx.path);
      if (!completed) return;

      const newSession = ctx.context?.newSession;
      if (!newSession?.user?.id) return;

      await applyPostAuthPolicy({
        ...completed,
        user: newSession.user,
        invitationToken: getInvitationToken(ctx.body),
        rollbackNewUser: async () => {
          // Delete via Better Auth's deleteUser API so all related records
          // (accounts, sessions, plugin data) are properly cleaned up.
          const headers = new Headers();
          headers.set("Authorization", `Bearer ${newSession.session.token}`);
          await auth.api.deleteUser({ headers, body: {} });
        },
      });
    }),
  },

  databaseHooks: {
    user: {
      update: {
        async after(user) {
          if (!IS_BILLING_ENABLED || !polarClient || !user.email) return;
          try {
            await polarClient.customers.updateExternal({
              externalId: user.id,
              customerUpdateExternalID: { email: user.email },
            });
          } catch {
            // Customer may not exist in Polar yet (never checked out)
          }
        },
      },
    },
    // Account creation is the only mutation that can grant or revoke the
    // email-verification exemption: the flag depends solely on which account
    // rows exist, so password updates never affect it (deliberately — Better
    // Auth's updatePassword goes through updateMany, whose after-hook receives
    // a row count, not a row). Deletion has no hook, but a stale flag from an
    // unlink can only be false-when-it-could-be-true — never fail-open.
    account: {
      create: {
        async after(accountRow) {
          try {
            await refreshEmailVerificationExempt(db, accountRow.userId);
          } catch (error) {
            // The flag defaults to non-exempt (fail-closed), and Better Auth
            // rethrows hook failures after the transaction has committed — a
            // failed refresh must not turn a successful sign-up into a 500.
            captureException(error);
          }
        },
      },
    },
  },

  /** if no database is provided, the user data will be stored in memory.
   * Make sure to provide a database to persist user data **/
});
