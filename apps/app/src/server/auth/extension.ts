import { and, eq, inArray } from "drizzle-orm";
import { getAllowedExtensionRedirectUris } from "./extension-origin";
import {
  SERIAL_EXTENSION_AUTH_SCOPES,
  SERIAL_EXTENSION_CLIENT_ID,
} from "./extension-config";
import { extensionOAuthClientNeedsUpdate } from "~/lib/extension-auth";
import { db } from "~/server/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthRefreshToken,
} from "~/server/db/schema";

export { SERIAL_EXTENSION_AUTH_SCOPES, SERIAL_EXTENSION_CLIENT_ID };

const EXTENSION_CLIENT_PROVISIONING = {
  attempts: 2,
  retryDelayMs: 100,
  timeoutMs: 2_000,
} as const;

type ExtensionClientProvisioningResult = "created" | "unchanged" | "updated";

let extensionClientIsProvisioned = false;
let extensionClientProvisioning: Promise<ExtensionClientProvisioningResult> | null =
  null;

function managedExtensionOAuthClientValues() {
  return {
    name: "Serial browser extension",
    redirectUris: getAllowedExtensionRedirectUris(),
    scopes: [...SERIAL_EXTENSION_AUTH_SCOPES],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    public: true,
    requirePKCE: true,
    skipConsent: true,
    enableEndSession: false,
  };
}

export async function provisionExtensionOAuthClient() {
  const expected = managedExtensionOAuthClientValues();
  const existing = await db.query.oauthClient.findFirst({
    where: eq(oauthClient.clientId, SERIAL_EXTENSION_CLIENT_ID),
  });

  if (!existing) {
    const now = new Date();
    await db
      .insert(oauthClient)
      .values({
        id: SERIAL_EXTENSION_CLIENT_ID,
        clientId: SERIAL_EXTENSION_CLIENT_ID,
        ...expected,
        disabled: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: oauthClient.clientId });
    return "created" as const;
  }

  if (!extensionOAuthClientNeedsUpdate(existing, expected)) {
    return "unchanged" as const;
  }

  await db
    .update(oauthClient)
    .set({
      ...expected,
      // `disabled` is intentionally omitted so an operator can disable the
      // extension client without a public request or restart undoing it.
      updatedAt: new Date(),
    })
    .where(eq(oauthClient.clientId, SERIAL_EXTENSION_CLIENT_ID));
  return "updated" as const;
}

function waitForProvisioningRetry() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, EXTENSION_CLIENT_PROVISIONING.retryDelayMs);
  });
}

function provisioningAttempt() {
  if (extensionClientIsProvisioned) {
    return Promise.resolve("unchanged" as const);
  }
  if (extensionClientProvisioning) return extensionClientProvisioning;

  const attempt = provisionExtensionOAuthClient().then((result) => {
    extensionClientIsProvisioned = true;
    return result;
  });
  extensionClientProvisioning = attempt;
  void attempt
    .finally(() => {
      if (extensionClientProvisioning === attempt) {
        extensionClientProvisioning = null;
      }
    })
    .catch(() => undefined);
  return attempt;
}

function provisionWithDeadline(
  attempt: Promise<ExtensionClientProvisioningResult>,
) {
  return new Promise<ExtensionClientProvisioningResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Extension OAuth client provisioning timed out"));
    }, EXTENSION_CLIENT_PROVISIONING.timeoutMs);

    void attempt.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function ensureExtensionOAuthClient() {
  if (extensionClientIsProvisioned) return "unchanged" as const;

  let lastError: unknown;
  for (
    let attemptNumber = 1;
    attemptNumber <= EXTENSION_CLIENT_PROVISIONING.attempts;
    attemptNumber += 1
  ) {
    try {
      return await provisionWithDeadline(provisioningAttempt());
    } catch (error) {
      lastError = error;
      if (attemptNumber < EXTENSION_CLIENT_PROVISIONING.attempts) {
        await waitForProvisioningRetry();
      }
    }
  }

  throw new Error("Unable to provision the extension OAuth client", {
    cause: lastError,
  });
}

export async function revokeExtensionTokensForSession(sessionId: string) {
  const refreshTokens = await db
    .select({ id: oauthRefreshToken.id })
    .from(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthRefreshToken.sessionId, sessionId),
      ),
    )
    .all();

  const refreshTokenIds = refreshTokens.map(({ id }) => id);
  if (refreshTokenIds.length > 0) {
    await db
      .delete(oauthAccessToken)
      .where(inArray(oauthAccessToken.refreshId, refreshTokenIds));
  }

  await db
    .delete(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthAccessToken.sessionId, sessionId),
      ),
    );
  await db
    .delete(oauthRefreshToken)
    .where(
      and(
        eq(oauthRefreshToken.clientId, SERIAL_EXTENSION_CLIENT_ID),
        eq(oauthRefreshToken.sessionId, sessionId),
      ),
    );
}
