import { render } from "react-email";
import { APIError } from "better-auth/api";
import { and, asc, count, eq } from "drizzle-orm";
import { createElement } from "react";
import { db } from "../db";
import { account, appConfig, session, user } from "../db/schema";
import type { AuthProvider } from "~/lib/constants";
import NewUserNotificationEmail from "~/emails/new-user-notification";
import {
  getAvailableSignupProviders,
  getEnabledAuthProviders,
  isPublicSignupEnabled,
} from "~/lib/constants";
import {
  getAccountProviderId,
  getConfiguredAuthProviders,
} from "~/server/auth/constants";
import { IS_EMAIL_ENABLED, sendEmail } from "~/server/email";
import {
  redeemInvitationToken,
  validateInvitationToken,
} from "~/server/invitations";
import { captureException } from "~/server/logger";
import { IS_DEMO_INSTANCE } from "~/lib/demo";

/**
 * Account policy shared by every auth method (email, generic OAuth, and
 * future providers such as atproto). Callers identify the provider
 * explicitly; nothing in here inspects request paths.
 */

const SIGN_IN_DISABLED_MESSAGES: Record<AuthProvider, string> = {
  email: "Email sign in is currently disabled",
  oauth: "OAuth is currently disabled",
  atproto: "Atmosphere sign in is currently disabled",
};

const SIGN_UPS_DISABLED_MESSAGE = "Sign ups are currently disabled";

/**
 * How recently a user must have been created for the callback rollback to
 * treat them as auto-created by that same callback. Generous — the row is
 * written milliseconds before the after-hook runs — while keeping any
 * established account safely out of rollback's reach.
 */
export const AUTO_SIGNUP_ROLLBACK_WINDOW_MS = 60 * 1000;

export interface AuthAttempt {
  provider: AuthProvider;
  intent: "sign-in" | "sign-up";
  /** Invitation token from the request body, if the adapter found one. */
  invitationToken?: string;
}

/**
 * Gate an incoming sign-in or sign-up attempt against the instance's
 * enabled-provider configuration. Throws an APIError when the attempt is
 * disallowed; returns silently when it may proceed.
 *
 * OAuth-style providers whose callback may auto-create a user should gate
 * with intent "sign-in" and rely on applyPostAuthPolicy to roll back
 * disallowed auto-signups.
 */
export async function enforceAuthAttemptPolicy(
  attempt: AuthAttempt,
): Promise<void> {
  // In demo mode, allow all sign-ups without gating so auto-provisioning
  // can create users on demand.
  if (IS_DEMO_INSTANCE && attempt.intent === "sign-up") return;

  // Allow first user to use any available method
  const userCount = await db.select({ count: count() }).from(user).get();
  if ((userCount?.count ?? 0) === 0) return;

  const configs = await db.select().from(appConfig).all();

  if (attempt.intent === "sign-in") {
    const signinConfig = configs.find(
      (c) => c.key === "enabled-signin-providers",
    );
    const signinProviders = getEnabledAuthProviders(signinConfig?.value);
    if (!signinProviders.includes(attempt.provider)) {
      throw new APIError("BAD_REQUEST", {
        message: SIGN_IN_DISABLED_MESSAGES[attempt.provider],
      });
    }
    return;
  }

  const signupConfig = configs.find(
    (c) => c.key === "enabled-signup-providers",
  );
  const publicSignupConfig = configs.find(
    (c) => c.key === "public-signup-enabled",
  );
  const availableSignupProviders = getAvailableSignupProviders({
    isFirstUser: false,
    publicSignupEnabled: isPublicSignupEnabled(publicSignupConfig?.value),
    signupProvidersConfig: signupConfig?.value,
    configuredProviders: getConfiguredAuthProviders(),
  });

  if (!availableSignupProviders.includes(attempt.provider)) {
    // Check for a valid invitation token before blocking.
    if (attempt.invitationToken !== undefined) {
      const validatedInvitationToken = await validateInvitationToken(
        attempt.invitationToken,
      );
      if (validatedInvitationToken) {
        // Token is valid — allow sign-up to proceed. The post-auth policy
        // atomically records the redemption (with a transaction) to
        // prevent TOCTOU races with concurrent sign-ups.
        return;
      }
    }

    throw new APIError("BAD_REQUEST", { message: SIGN_UPS_DISABLED_MESSAGE });
  }
}

/**
 * Pre-flight sign-up gate for OAuth-style providers that can resolve the
 * provider-side account id before redirecting (atproto resolves the DID
 * from the typed identifier; generic OAuth cannot pre-flight because its
 * account id only arrives in the callback). An existing account row makes
 * the attempt a plain sign-in; without one the callback would auto-create
 * a user, so the attempt must clear sign-up policy now — immediate
 * feedback on the auth page instead of create-then-roll-back. The
 * post-auth rollback stays as defense-in-depth for the race where the
 * account row disappears between this check and the callback.
 */
export async function enforceResolvedSignupPolicy(input: {
  provider: AuthProvider;
  /** The provider's Better Auth `account.providerId` value. */
  providerId: string;
  /** Provider-side account id (the DID for atproto). */
  accountId: string;
}): Promise<void> {
  const existing = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.providerId, input.providerId),
        eq(account.accountId, input.accountId),
      ),
    )
    .get();
  if (existing) return;

  await enforceAuthAttemptPolicy({
    provider: input.provider,
    intent: "sign-up",
  });
}

export interface CompletedAuth {
  provider: AuthProvider;
  /**
   * Deliberately a different axis from AuthAttempt.intent: before the
   * request runs we know what the caller wants (sign in vs sign up); after
   * it we only know which flow completed — "sign-up" for explicit sign-up
   * requests, "callback" for OAuth-style callbacks that may be either a
   * sign-in or an auto-created sign-up.
   */
  flow: "sign-up" | "callback";
  user: { id: string; name: string; email: string };
  /** Invitation token from the request body, if the adapter found one. */
  invitationToken?: string;
  /**
   * Deletes the just-created user and all related records (accounts,
   * sessions, plugin data). Supplied by the adapter because deletion is a
   * server-side mechanism the policy stays agnostic to — the after-hook's
   * request carries no usable credentials (the new session only exists on
   * the response), so the adapter deletes directly rather than through a
   * credentialed Better Auth API call.
   */
  rollbackNewUser: () => Promise<void>;
}

/**
 * Apply post-authentication account policy after a new session was created
 * by a sign-up-capable flow: invitation redemption, first-user admin
 * promotion and initial provider recording, rollback of disallowed
 * auto-signups, and admin signup notification.
 */
export async function applyPostAuthPolicy(
  completed: CompletedAuth,
): Promise<void> {
  const userId = completed.user.id;

  // Atomically record the invitation redemption. The transaction in
  // redeemInvitationToken re-checks the max-uses count so that two
  // concurrent sign-ups can't both consume the last slot.
  if (completed.flow === "sign-up") {
    if (completed.invitationToken !== undefined) {
      const redeemed = await redeemInvitationToken(
        completed.invitationToken,
        userId,
      );
      if (!redeemed) {
        // Another concurrent sign-up consumed the last use between the
        // attempt gate and now. Roll back the newly created user.
        await completed.rollbackNewUser();
        throw new APIError("BAD_REQUEST", {
          message: SIGN_UPS_DISABLED_MESSAGE,
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

  if (firstUser?.id === userId && !IS_DEMO_INSTANCE) {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, userId));

    // Set sign-in and sign-up methods to match how the first user signed up
    const providers = JSON.stringify([completed.provider]);
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
  } else if (completed.flow === "callback") {
    // Non-first user arriving via a callback — the provider may have
    // auto-created a user. Roll back only when this is genuinely that
    // auto-created user: created within this request (creation recency)
    // and holding no other session. Session count alone is not enough — an
    // established user whose provider was linked as an add-on connection
    // can arrive via callback with exactly one session (all others
    // expired), and deleting them here would destroy a real account.
    const userRow = await db
      .select({ createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    const wasJustCreated =
      !!userRow &&
      Date.now() - userRow.createdAt.getTime() <=
        AUTO_SIGNUP_ROLLBACK_WINDOW_MS;

    const sessionCount = await db
      .select({ count: count() })
      .from(session)
      .where(eq(session.userId, userId))
      .get();

    // A callback can also arrive for an established user who just linked
    // this provider (implicit account linking), and such a user may pass
    // both checks above (created moments earlier, no session issued by
    // their own sign-up flow). Only a user whose sole account row belongs
    // to this callback's provider can be its auto-created sign-up; anyone
    // with another provider's row — or more than one row — got here by
    // linking to an account that already existed.
    const accountRows = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, userId))
      .all();
    const isSoleProviderAccount =
      accountRows.length === 1 &&
      accountRows[0]!.providerId === getAccountProviderId(completed.provider);

    if (
      wasJustCreated &&
      (sessionCount?.count ?? 0) <= 1 &&
      isSoleProviderAccount
    ) {
      const configs = await db.select().from(appConfig).all();
      const publicSignupConfig = configs.find(
        (c) => c.key === "public-signup-enabled",
      );
      const signupConfig = configs.find(
        (c) => c.key === "enabled-signup-providers",
      );

      const availableProviders = getAvailableSignupProviders({
        isFirstUser: false,
        publicSignupEnabled: isPublicSignupEnabled(publicSignupConfig?.value),
        signupProvidersConfig: signupConfig?.value,
        configuredProviders: getConfiguredAuthProviders(),
      });

      if (!availableProviders.includes(completed.provider)) {
        await completed.rollbackNewUser();
        throw new APIError("BAD_REQUEST", {
          message: SIGN_UPS_DISABLED_MESSAGE,
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
        const html = await render(
          createElement(NewUserNotificationEmail, {
            userName: completed.user.name,
            userEmail: completed.user.email,
          }),
        );

        await sendEmail({
          to: emailConfig.value,
          subject: `New user signed up: ${completed.user.name}`,
          html,
        });
      }
    } catch (err) {
      // Don't block sign-up if notification email fails
      captureException(err);
    }
  }
}
