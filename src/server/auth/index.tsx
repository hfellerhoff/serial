import { render } from "@react-email/components";
import { betterAuth } from "better-auth";
import { admin, emailOTP, genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { asc, count, eq } from "drizzle-orm";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { createElement } from "react";
import { db } from "../db";
import { appConfig, session, user } from "../db/schema";
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
import NewUserNotificationEmail from "~/emails/new-user-notification";
import ResetPasswordEmail from "~/emails/reset-password";
import VerifyEmailEmail from "~/emails/verify-email";
import VerifyEmailChangeEmail from "~/emails/verify-email-change";
import {
  BASE_SIGNED_OUT_URL,
  getAvailableSignupProviders,
  getEnabledAuthProviders,
  isPublicSignupEnabled,
} from "~/lib/constants";
import { isOAuthConfigured } from "~/server/auth/constants";
import { IS_EMAIL_ENABLED, sendEmail } from "~/server/email";
import {
  redeemInvitationToken,
  validateInvitationToken,
} from "~/server/invitations";
import { setOtpCooldown } from "~/server/otp";
import { captureException } from "~/server/logger";
import { env } from "~/env";

export const authMiddleware = createMiddleware().server(
  async ({ pathname, next }) => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({ headers });
    if (!session) {
      if (!pathname.startsWith("/auth/") && pathname !== "/auth") {
        throw redirect({ to: BASE_SIGNED_OUT_URL });
      }
    }

    // Redirect unverified users to the verification page.
    // Exempt /api/auth/* (sign-out, OTP verification) and /auth/* (other auth
    // pages like sign-in) so the user can still sign out or complete flows.
    if (
      IS_EMAIL_ENABLED &&
      session &&
      !session.user.emailVerified &&
      pathname !== "/auth/verify-email" &&
      !pathname.startsWith("/api/auth/")
    ) {
      throw redirect({ to: "/auth/verify-email" });
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
    console.error(
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
          pkce: env.OAUTH_PKCE === "true",
        },
      ],
    }),
  ];
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
    maxPasswordLength: 64,
    async sendResetPassword(data) {
      try {
        const html = await render(
          <ResetPasswordEmail
            resetUrl={data.url}
            supportEmail={env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS}
          />,
        );

        await sendEmail({
          to: data.user.email,
          subject: "Reset your password for Serial",
          html,
        });
        console.log(`[auth] Reset password email sent to ${data.user.email}`);
      } catch (error) {
        console.error(
          `[auth] Failed to send reset password email to ${data.user.email}:`,
          error,
        );
        throw error;
      }
    },
  },
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const html = await render(
          <VerifyEmailChangeEmail
            verificationUrl={url}
            supportEmail={env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS}
          />,
        );

        void sendEmail({
          to: user.email,
          subject: "Verify your new email for Serial",
          html,
        });
        console.log(`[auth] Email change verification sent to ${user.email}`);
      } catch (error) {
        console.error(
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
                      supportEmail={env.VITE_PUBLIC_SUPPORT_EMAIL_ADDRESS}
                    />,
                  );
                  await sendEmail({
                    to: email,
                    subject: "Verify your email for Serial",
                    html,
                  });
                  console.log(`[auth] Verification email sent to ${email}`);
                } catch (error) {
                  console.error(
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
      const isEmailSignUp = ctx.path.startsWith("/sign-up");
      const isEmailSignIn = ctx.path.startsWith("/sign-in/email");
      const isOAuth =
        ctx.path.startsWith("/sign-in/oauth2") ||
        ctx.path.startsWith("/oauth2/callback/");

      if (!isEmailSignUp && !isEmailSignIn && !isOAuth) return;

      // Allow first user to use any available method
      const userCount = await db.select({ count: count() }).from(user).get();
      if ((userCount?.count ?? 0) === 0) return;

      const configs = await db.select().from(appConfig).all();
      const signinConfig = configs.find(
        (c) => c.key === "enabled-signin-providers",
      );
      const signupConfig = configs.find(
        (c) => c.key === "enabled-signup-providers",
      );
      const publicSignupConfig = configs.find(
        (c) => c.key === "public-signup-enabled",
      );
      const signinProviders = getEnabledAuthProviders(signinConfig?.value);

      // Sign-in gating
      if (isEmailSignIn && !signinProviders.includes("email")) {
        throw new APIError("BAD_REQUEST", {
          message: "Email sign in is currently disabled",
        });
      }

      if (isOAuth && !signinProviders.includes("oauth")) {
        throw new APIError("BAD_REQUEST", {
          message: "OAuth is currently disabled",
        });
      }

      const oauthConfigured = isOAuthConfigured();
      const availableSignupProviders = getAvailableSignupProviders({
        isFirstUser: false,
        publicSignupEnabled: isPublicSignupEnabled(publicSignupConfig?.value),
        signupProvidersConfig: signupConfig?.value,
        oauthConfigured,
      });

      // Sign-up gating
      if (isEmailSignUp && !availableSignupProviders.includes("email")) {
        // Check for a valid invitation token before blocking.
        // The invitationToken field is an extra body param passed through by
        // Better Auth — not schema-validated, so we type-check manually.
        const invitationToken = ctx.body?.invitationToken;
        if (typeof invitationToken === "string") {
          const validatedInvitationToken =
            await validateInvitationToken(invitationToken);
          if (validatedInvitationToken) {
            // Token is valid — allow sign-up to proceed. The after hook
            // atomically records the redemption (with a transaction) to
            // prevent TOCTOU races with concurrent sign-ups.
            return;
          }
        }

        throw new APIError("BAD_REQUEST", {
          message: "Sign ups are currently disabled",
        });
      }

      // If neither OAuth sign-in nor sign-up is allowed, the isOAuth check
      // above already blocked it. No additional gating needed here — the
      // after hook handles the case where OAuth sign-in is enabled but
      // sign-up is not (rolling back auto-created users).
    }),
    after: createAuthMiddleware(async (ctx) => {
      const isEmailSignUp = ctx.path.startsWith("/sign-up");
      const isOAuthCallback = ctx.path.startsWith("/oauth2/callback/");
      if (!(isEmailSignUp || isOAuthCallback)) return;
      if (!ctx.context?.newSession?.user?.id) return;

      const userId = ctx.context.newSession.user.id;

      // Atomically record the invitation redemption. The transaction in
      // redeemInvitationToken re-checks the max-uses count so that two
      // concurrent sign-ups can't both consume the last slot.
      if (isEmailSignUp) {
        const invitationToken = ctx.body?.invitationToken;
        if (typeof invitationToken === "string") {
          const redeemed = await redeemInvitationToken(invitationToken, userId);
          if (!redeemed) {
            // Another concurrent sign-up consumed the last use between the
            // before hook and now. Roll back the newly created user via
            // Better Auth's deleteUser API so all related records
            // (accounts, sessions, plugin data) are properly cleaned up.
            const headers = new Headers();
            headers.set(
              "Authorization",
              `Bearer ${ctx.context.newSession.session.token}`,
            );
            await auth.api.deleteUser({ headers, body: {} });
            throw new APIError("BAD_REQUEST", {
              message: "Sign ups are currently disabled",
            });
          }
        }
      }

      // Check if this user is the first user by creation time
      const firstUser = await db
        .select({ id: user.id })
        .from(user)
        .orderBy(asc(user.createdAt))
        .limit(1)
        .get();

      if (firstUser?.id === userId) {
        await db.update(user).set({ role: "admin" }).where(eq(user.id, userId));

        // Set sign-in and sign-up methods to match how the first user signed up
        const method: string = isOAuthCallback ? "oauth" : "email";
        const providers = JSON.stringify([method]);
        await db
          .insert(appConfig)
          .values({
            key: "enabled-signin-providers",
            value: providers,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appConfig.key,
            set: { value: providers, updatedAt: new Date() },
          });
        await db
          .insert(appConfig)
          .values({
            key: "enabled-signup-providers",
            value: providers,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: appConfig.key,
            set: { value: providers, updatedAt: new Date() },
          });
      } else if (isOAuthCallback) {
        // Non-first user arriving via OAuth callback — Better Auth may have
        // auto-created a user. If this is a brand-new user (single session)
        // and OAuth sign-ups aren't allowed, roll back the auto-created user.
        const sessionCount = await db
          .select({ count: count() })
          .from(session)
          .where(eq(session.userId, userId))
          .get();

        if ((sessionCount?.count ?? 0) <= 1) {
          const configs = await db.select().from(appConfig).all();
          const publicSignupConfig = configs.find(
            (c) => c.key === "public-signup-enabled",
          );
          const signupConfig = configs.find(
            (c) => c.key === "enabled-signup-providers",
          );

          const availableProviders = getAvailableSignupProviders({
            isFirstUser: false,
            publicSignupEnabled: isPublicSignupEnabled(
              publicSignupConfig?.value,
            ),
            signupProvidersConfig: signupConfig?.value,
            oauthConfigured: isOAuthConfigured(),
          });

          if (!availableProviders.includes("oauth")) {
            // Roll back the auto-created user via Better Auth's deleteUser
            // API so all related records are properly cleaned up.
            const rollbackHeaders = new Headers();
            rollbackHeaders.set(
              "Authorization",
              `Bearer ${ctx.context.newSession.session.token}`,
            );
            await auth.api.deleteUser({
              headers: rollbackHeaders,
              body: {},
            });
            throw new APIError("BAD_REQUEST", {
              message: "Sign ups are currently disabled",
            });
          }
        }
      }

      // Send admin notification email for non-first user sign-ups
      if (firstUser?.id !== userId && IS_EMAIL_ENABLED) {
        try {
          const notifyConfig = await db
            .select()
            .from(appConfig)
            .where(eq(appConfig.key, "admin-notify-on-signup"))
            .get();
          const emailConfig = await db
            .select()
            .from(appConfig)
            .where(eq(appConfig.key, "admin-notify-email"))
            .get();

          if (notifyConfig?.value === "true" && emailConfig?.value) {
            const newUser = ctx.context.newSession.user;
            const html = await render(
              createElement(NewUserNotificationEmail, {
                userName: newUser.name,
                userEmail: newUser.email,
              }),
            );

            await sendEmail({
              to: emailConfig.value,
              subject: `New user signed up: ${newUser.name ?? newUser.email}`,
              html,
            });
          }
        } catch (err) {
          // Don't block sign-up if notification email fails
          captureException(err);
        }
      }
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
  },

  /** if no database is provided, the user data will be stored in memory.
   * Make sure to provide a database to persist user data **/
});

export async function getServerAuth(headers: Headers) {
  return await auth.api.getSession({
    headers,
  });
}

export async function isServerAuthed(headers: Headers) {
  const authResult = await auth.api.getSession({
    headers,
  });

  return !!authResult?.session.id && !!authResult.user.id;
}
