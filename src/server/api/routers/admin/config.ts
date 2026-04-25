import { ORPCError } from "@orpc/server";
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure } from "./base";
import type { AuthProvider } from "~/lib/constants";
import {
  authProviderSchema,
  CREDENTIAL_PROVIDER_ID,
  getAvailableSignupProviders,
  getEnabledAuthProviders,
  isPublicSignupEnabled,
} from "~/lib/constants";
import { isOAuthConfigured } from "~/server/auth/constants";
import { validateInvitationToken } from "~/server/invitations";
import { env } from "~/env";
import { publicProcedure } from "~/server/orpc/base";
import { account, appConfig, user } from "~/server/db/schema";
import { db } from "~/server/db";

// Get public signup setting (admin)
export const getPublicSignupSetting = adminProcedure.handler(async () => {
  const configs = await db.select().from(appConfig).all();
  const publicSignup = configs.find((c) => c.key === "public-signup-enabled");
  const signinProvidersConfig = configs.find(
    (c) => c.key === "enabled-signin-providers",
  );
  const signupProvidersConfig = configs.find(
    (c) => c.key === "enabled-signup-providers",
  );

  // Determine which sign-in methods are the sole method for any admin
  // (i.e. disabling them would lock that admin out)
  const adminUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .all();

  const requiredMethods = new Set<AuthProvider>();

  if (adminUsers.length > 0) {
    const adminAccountRows = await db
      .select({ userId: account.userId, providerId: account.providerId })
      .from(account)
      .where(
        sql`${account.userId} IN (${sql.join(
          adminUsers.map((u) => sql`${u.id}`),
          sql`, `,
        )})`,
      )
      .all();

    const oauthProviderId = env.OAUTH_PROVIDER_ID;

    // A method is "required" if any admin has it as their only sign-in method
    for (const admin of adminUsers) {
      const rows = adminAccountRows.filter((r) => r.userId === admin.id);
      const methods: AuthProvider[] = [];
      if (rows.some((a) => a.providerId === CREDENTIAL_PROVIDER_ID)) {
        methods.push("email");
      }
      if (
        oauthProviderId &&
        rows.some((a) => a.providerId === oauthProviderId)
      ) {
        methods.push("oauth");
      }
      if (methods.length === 1) {
        requiredMethods.add(methods[0]!);
      }
    }
  }

  return {
    enabled: isPublicSignupEnabled(publicSignup?.value),
    signinProviders: getEnabledAuthProviders(signinProvidersConfig?.value),
    signupProviders: getEnabledAuthProviders(signupProvidersConfig?.value),
    isOAuthConfigured: isOAuthConfigured(),
    oauthProviderName: env.OAUTH_PROVIDER_NAME ?? "OAuth",
    adminSigninMethods: [...requiredMethods],
  };
});

// Set public signup setting
export const setPublicSignupSetting = adminProcedure
  .input(
    z.object({
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input }) => {
    await db
      .insert(appConfig)
      .values({
        key: "public-signup-enabled",
        value: input.enabled ? "true" : "false",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value: input.enabled ? "true" : "false",
          updatedAt: new Date(),
        },
      });

    return { enabled: input.enabled };
  });

// Get admin signup notification settings
export const getSignupNotificationSetting = adminProcedure.handler(async () => {
  const configs = await db.select().from(appConfig).all();
  const notifyEnabled = configs.find((c) => c.key === "admin-notify-on-signup");
  const notifyEmail = configs.find((c) => c.key === "admin-notify-email");

  return {
    enabled: notifyEnabled?.value === "true",
    email: notifyEmail?.value ?? "",
  };
});

// Set admin signup notification settings
export const setSignupNotificationSetting = adminProcedure
  .input(
    z.object({
      enabled: z.boolean(),
      email: z.string().email().optional(),
    }),
  )
  .handler(async ({ input }) => {
    await db
      .insert(appConfig)
      .values({
        key: "admin-notify-on-signup",
        value: input.enabled ? "true" : "false",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value: input.enabled ? "true" : "false",
          updatedAt: new Date(),
        },
      });

    if (input.email) {
      await db
        .insert(appConfig)
        .values({
          key: "admin-notify-email",
          value: input.email,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: appConfig.key,
          set: {
            value: input.email,
            updatedAt: new Date(),
          },
        });
    }

    return { enabled: input.enabled, email: input.email };
  });

// Set enabled sign-in providers
export const setEnabledSigninProviders = adminProcedure
  .input(
    z.object({
      providers: z.array(authProviderSchema),
    }),
  )
  .handler(async ({ input }) => {
    // Prevent disabling sign-in methods that would lock out any admin
    const adminUsers = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.role, "admin"))
      .all();

    if (adminUsers.length > 0) {
      const adminAccountRows = await db
        .select({ userId: account.userId, providerId: account.providerId })
        .from(account)
        .where(
          sql`${account.userId} IN (${sql.join(
            adminUsers.map((u) => sql`${u.id}`),
            sql`, `,
          )})`,
        )
        .all();

      const oauthProviderId = env.OAUTH_PROVIDER_ID;
      for (const admin of adminUsers) {
        const methods: AuthProvider[] = [];
        const rows = adminAccountRows.filter((r) => r.userId === admin.id);
        if (rows.some((a) => a.providerId === CREDENTIAL_PROVIDER_ID)) {
          methods.push("email");
        }
        if (
          oauthProviderId &&
          rows.some((a) => a.providerId === oauthProviderId)
        ) {
          methods.push("oauth");
        }
        const hasRemaining = methods.some((m) => input.providers.includes(m));
        if (!hasRemaining) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              "Cannot disable sign-in methods — this would lock out an admin user",
          });
        }
      }
    }

    const value = JSON.stringify(input.providers);
    await db
      .insert(appConfig)
      .values({
        key: "enabled-signin-providers",
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value,
          updatedAt: new Date(),
        },
      });

    return { providers: input.providers };
  });

// Set enabled sign-up providers
export const setEnabledSignupProviders = adminProcedure
  .input(
    z.object({
      providers: z.array(authProviderSchema),
    }),
  )
  .handler(async ({ input }) => {
    const value = JSON.stringify(input.providers);
    await db
      .insert(appConfig)
      .values({
        key: "enabled-signup-providers",
        value,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appConfig.key,
        set: {
          value,
          updatedAt: new Date(),
        },
      });

    return { providers: input.providers };
  });

// Public procedure: sign-in page config
export const getSigninConfig = publicProcedure.handler(async () => {
  const configs = await db.select().from(appConfig).all();
  const signinConfig = configs.find(
    (c) => c.key === "enabled-signin-providers",
  );
  const signupConfig = configs.find(
    (c) => c.key === "enabled-signup-providers",
  );
  const publicSignup = configs.find((c) => c.key === "public-signup-enabled");

  const userCount = await db.select({ count: count() }).from(user).get();
  const isFirstUser = (userCount?.count ?? 0) === 0;
  const oauthConfigured = isOAuthConfigured();

  const filterOAuth = (providers: AuthProvider[]) =>
    oauthConfigured ? providers : providers.filter((p) => p !== "oauth");

  const signinProviders = filterOAuth(
    getEnabledAuthProviders(signinConfig?.value),
  );

  const signupProviders = getAvailableSignupProviders({
    isFirstUser,
    publicSignupEnabled: isPublicSignupEnabled(publicSignup?.value),
    signupProvidersConfig: signupConfig?.value,
    oauthConfigured,
  });

  return {
    isFirstUser,
    signinProviders,
    signupEnabled: signupProviders.length > 0,
    isOAuthConfigured: oauthConfigured,
    oauthProviderName: env.OAUTH_PROVIDER_NAME ?? "OAuth",
    oauthProviderId: signinProviders.includes("oauth")
      ? (env.OAUTH_PROVIDER_ID ?? "")
      : "",
  };
});

// Public procedure: sign-up page config
export const getSignupConfig = publicProcedure
  .input(z.object({ token: z.string().optional() }).optional())
  .handler(async ({ input }) => {
    const configs = await db.select().from(appConfig).all();
    const publicSignup = configs.find((c) => c.key === "public-signup-enabled");
    const signupConfig = configs.find(
      (c) => c.key === "enabled-signup-providers",
    );

    const userCount = await db.select({ count: count() }).from(user).get();
    const isFirstUser = (userCount?.count ?? 0) === 0;
    const oauthConfigured = isOAuthConfigured();

    // If a valid invitation token is provided, check if it allows signup
    if (input?.token) {
      const inv = await validateInvitationToken(input.token);

      return {
        enabled: inv !== null,
        isFirstUser: false,
        inviterName: inv?.inviterName ?? null,
        signupProviders: inv ? (["email"] as AuthProvider[]) : [],
        isOAuthConfigured: oauthConfigured,
        oauthProviderName: env.OAUTH_PROVIDER_NAME ?? "OAuth",
        oauthProviderId: "",
      };
    }

    const signupProviders = getAvailableSignupProviders({
      isFirstUser,
      publicSignupEnabled: isPublicSignupEnabled(publicSignup?.value),
      signupProvidersConfig: signupConfig?.value,
      oauthConfigured,
    });

    return {
      enabled: signupProviders.length > 0,
      isFirstUser,
      inviterName: null,
      signupProviders,
      isOAuthConfigured: oauthConfigured,
      oauthProviderName: env.OAUTH_PROVIDER_NAME ?? "OAuth",
      oauthProviderId: signupProviders.includes("oauth")
        ? (env.OAUTH_PROVIDER_ID ?? "")
        : "",
    };
  });
