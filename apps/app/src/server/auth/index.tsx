import { render } from "react-email";
import { betterAuth } from "better-auth";
import { admin, emailOTP, genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
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
import ResetPasswordEmail from "~/emails/reset-password";
import VerifyEmailEmail from "~/emails/verify-email";
import VerifyEmailChangeEmail from "~/emails/verify-email-change";
import { BASE_SIGNED_OUT_URL } from "~/lib/constants";
import { isAtprotoPlaceholderEmail } from "~/lib/auth/atproto";
import {
  isAtprotoConfigured,
  isOAuthConfigured,
  TRUSTED_ORIGINS_SET,
} from "~/server/auth/constants";
import { ATPROTO_ROUTES } from "~/server/auth/atproto/config";
import { atprotoPlugin } from "~/server/auth/atproto/plugin";
import {
  classifyAuthRequest,
  classifyCompletedAuth,
} from "~/server/auth/classify";
import {
  refreshEmailVerificationExempt,
  requiresEmailVerification,
} from "~/server/auth/email-verification-policy";
import {
  applyPostAuthPolicy,
  enforceAuthAttemptPolicy,
} from "~/server/auth/policy";
import {
  revokeAtprotoGrantsBeforeUserDeletion,
  rollbackAutoCreatedUserFromHook,
} from "~/server/auth/rollback";
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
  // Rate limiting rides Better Auth's defaults (production-only, built-in
  // 3-per-10s specials on sign-in/sign-up/change-password/change-email).
  // The atproto plugin declares stricter per-path rules on its own
  // endpoints because authorize fans out to outbound identity resolution.
  advanced: {
    ...(env.COOKIE_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.COOKIE_DOMAIN,
          },
        }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
    maxPasswordLength: 64,
    async sendResetPassword(data) {
      // A DID-only user's internal placeholder address is never
      // deliverable; setting a password requires adding a real email
      // first (the settings dialog enforces the same order).
      if (isAtprotoPlaceholderEmail(data.user.email)) {
        logMessage(
          "[auth] Skipped reset password email for placeholder address",
        );
        return;
      }
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
      // Without email transport a verification round trip can never
      // complete, which would leave a DID-only user unable to ever add a
      // real email (and therefore a password). Apply an unverified user's
      // change directly in that case — "verified when transport is
      // configured" per the atproto onboarding decision. Verified users
      // are unaffected: the option only applies when emailVerified is
      // false.
      enabled: true,
      updateEmailWithoutVerification: !IS_EMAIL_ENABLED,
    },
    deleteUser: {
      enabled: true,
      async beforeDelete(user) {
        await revokeAtprotoGrantsBeforeUserDeletion(user.id);
      },
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Better Auth still invokes this after a direct (no-transport) email
      // update; without a provider the send below would reject unhandled.
      if (!IS_EMAIL_ENABLED) return;
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

      // The typeahead serves the anonymous auth pages and the signed-in
      // connections link form alike. Its sign-in classification exists to
      // deny anonymous relay into the AppView search index when Atmosphere
      // sign-in is disabled — a session holder can already start a link
      // (which the sign-in toggle does not govern), so handle search stays
      // available to them.
      if (
        ctx.path === ATPROTO_ROUTES.typeahead &&
        (await getSessionFromCtx(ctx))
      ) {
        return;
      }

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
        rollbackNewUser: () =>
          rollbackAutoCreatedUserFromHook(ctx, newSession.user.id),
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
