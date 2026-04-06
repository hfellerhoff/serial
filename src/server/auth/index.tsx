import { render } from "@react-email/components";
import sendgrid from "@sendgrid/mail";
import { betterAuth } from "better-auth";
import { admin, emailOTP, genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { checkout, polar, portal, webhooks } from "@polar-sh/better-auth";
import { db } from "../db";
import { account, appConfig, feeds, session, user } from "../db/schema";
import { determinePlanFromProductId, PLANS } from "../subscriptions/plans";
import {
  deactivateExcessFeeds,
  invalidatePlanCache,
} from "../subscriptions/helpers";
import { polarClient } from "../subscriptions/polar";
import ResetPasswordEmail from "~/emails/reset-password";
import VerifyEmailEmail from "~/emails/verify-email";
import {
  BASE_SIGNED_OUT_URL,
  getAvailableSignupProviders,
  getEnabledAuthProviders,
  isPublicSignupEnabled,
} from "~/lib/constants";
import { isOAuthConfigured } from "~/server/auth/constants";
import { env } from "~/env";

export const authMiddleware = createMiddleware().server(
  async ({ pathname, next }) => {
    const headers = getRequestHeaders() as Headers;
    const session = await auth.api.getSession({ headers });
    if (!session) {
      if (!pathname.includes("auth")) {
        throw redirect({ to: BASE_SIGNED_OUT_URL });
      }
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

async function handleSubscriptionEnd(payload: {
  data: { customer?: { externalId?: string | null } | null };
}) {
  const externalId = payload.data.customer?.externalId;
  if (!externalId) return;

  invalidatePlanCache(externalId);
  await deactivateExcessFeeds(db, externalId, PLANS.free.maxActiveFeeds);
  await db
    .update(feeds)
    .set({ nextFetchAt: null })
    .where(eq(feeds.userId, externalId));
}

function buildPolarPlugin() {
  if (!polarClient) return [];
  if (!process.env.POLAR_WEBHOOK_SECRET) return [];

  const products = [
    process.env.POLAR_STANDARD_MONTHLY_PRODUCT_ID
      ? {
          productId: process.env.POLAR_STANDARD_MONTHLY_PRODUCT_ID,
          slug: "standard-monthly",
        }
      : null,
    process.env.POLAR_STANDARD_ANNUAL_PRODUCT_ID
      ? {
          productId: process.env.POLAR_STANDARD_ANNUAL_PRODUCT_ID,
          slug: "standard-annual",
        }
      : null,
    process.env.POLAR_PRO_MONTHLY_PRODUCT_ID
      ? {
          productId: process.env.POLAR_PRO_MONTHLY_PRODUCT_ID,
          slug: "pro-monthly",
        }
      : null,
    process.env.POLAR_PRO_ANNUAL_PRODUCT_ID
      ? {
          productId: process.env.POLAR_PRO_ANNUAL_PRODUCT_ID,
          slug: "pro-annual",
        }
      : null,
  ].filter(Boolean);

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
          secret: process.env.POLAR_WEBHOOK_SECRET ?? "",
          onSubscriptionActive: async (payload) => {
            const externalId = payload.data.customer?.externalId;
            if (!externalId) return;

            invalidatePlanCache(externalId);

            const productId = payload.data.productId;
            const planId = determinePlanFromProductId(productId);
            if (!planId) {
              console.warn(`[polar webhook] Unknown product ID: ${productId}`);
              return;
            }

            const config = PLANS[planId];
            if (config.backgroundRefreshIntervalMs) {
              // Stagger nextFetchAt across the refresh interval so feeds
              // don't all become due at the same instant (thundering herd).
              const activeFeeds = await db
                .select({ id: feeds.id })
                .from(feeds)
                .where(
                  and(eq(feeds.userId, externalId), eq(feeds.isActive, true)),
                )
                .all();

              const interval = config.backgroundRefreshIntervalMs;
              const feedCount = activeFeeds.length;
              if (feedCount > 0) {
                const nowMs = Date.now();
                const cases = activeFeeds.map((f, i) => {
                  const offset =
                    feedCount > 1 ? Math.round((interval / feedCount) * i) : 0;
                  const ts = Math.floor((nowMs + offset) / 1000);
                  return sql`WHEN ${f.id} THEN ${ts}`;
                });
                await db
                  .update(feeds)
                  .set({
                    nextFetchAt: sql`(CASE ${feeds.id} ${sql.join(cases, sql` `)} END)`,
                  })
                  .where(
                    inArray(
                      feeds.id,
                      activeFeeds.map((f) => f.id),
                    ),
                  );
              }
            }
          },
          onSubscriptionCanceled: async (payload) => {
            await handleSubscriptionEnd(payload);
          },
          onSubscriptionRevoked: async (payload) => {
            await handleSubscriptionEnd(payload);
          },
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
      sendgrid.setApiKey(import.meta.env.SENDGRID_API_KEY ?? "");

      const forgotPasswordEmailHtml = await render(
        <ResetPasswordEmail resetUrl={data.url} />,
      );

      const options = {
        from: "hey@serial.tube",
        to: data.user.email,
        subject: "Reset your password for Serial",
        html: forgotPasswordEmailHtml,
      };

      await sendgrid.send(options);
    },
  },
  plugins: [
    admin(),
    tanstackStartCookies(),
    ...buildPolarPlugin(),
    ...buildGenericOAuthPlugin(),
    ...(import.meta.env.SENDGRID_API_KEY
      ? [
          emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
              if (type === "email-verification") {
                sendgrid.setApiKey(import.meta.env.SENDGRID_API_KEY ?? "");
                const html = await render(<VerifyEmailEmail otp={otp} />);
                await sendgrid.send({
                  from: "hey@serial.tube",
                  to: email,
                  subject: "Verify your email for Serial",
                  html,
                });
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
            await db.delete(account).where(eq(account.userId, userId));
            await db.delete(session).where(eq(session.userId, userId));
            await db.delete(user).where(eq(user.id, userId));
            throw new APIError("BAD_REQUEST", {
              message: "Sign ups are currently disabled",
            });
          }
        }
      }
    }),
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
