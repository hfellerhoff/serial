import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { env } from "~/env";
import {
  DEFAULT_EXTENSION_REDIRECT_URIS,
  parseExtensionRedirectUri,
  validateExtensionCodeChallenge,
} from "~/lib/extension-auth";
import { db } from "~/server/db";
import { extensionSession, verification } from "~/server/db/schema";

const EXTENSION_GRANT_PREFIX = "extension-connect:";
const EXTENSION_GRANT_VERSION = 1;
const EXTENSION_GRANT_TTL_MS = 2 * 60 * 1_000;
const EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const EXTENSION_TOKEN_PREFIX = "serial_ext_";
const PKCE_VALUE_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const GRANT_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

type StoredExtensionGrant = {
  version: typeof EXTENSION_GRANT_VERSION;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  issuer: string;
};

export class InvalidExtensionGrantError extends Error {}

function randomUrlSafeString() {
  return randomBytes(32).toString("base64url");
}

function sha256UrlSafe(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function grantRecordId(code: string) {
  return `${EXTENSION_GRANT_PREFIX}${sha256UrlSafe(code)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredGrant(value: string): StoredExtensionGrant | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      parsed.version !== EXTENSION_GRANT_VERSION ||
      typeof parsed.userId !== "string" ||
      typeof parsed.redirectUri !== "string" ||
      typeof parsed.codeChallenge !== "string" ||
      typeof parsed.issuer !== "string"
    ) {
      return null;
    }
    return {
      version: EXTENSION_GRANT_VERSION,
      userId: parsed.userId,
      redirectUri: parsed.redirectUri,
      codeChallenge: parsed.codeChallenge,
      issuer: parsed.issuer,
    };
  } catch {
    return null;
  }
}

export function getAllowedExtensionRedirectUris() {
  return Array.from(
    new Set([
      ...DEFAULT_EXTENSION_REDIRECT_URIS,
      ...env.SERIAL_EXTENSION_REDIRECT_URIS,
    ]),
  );
}

export function validateExtensionRedirectUri(value: string) {
  const redirectUri = parseExtensionRedirectUri(value);
  if (!getAllowedExtensionRedirectUris().includes(redirectUri)) {
    throw new Error("This extension redirect URL is not registered");
  }
  return redirectUri;
}

export async function issueExtensionGrant(input: {
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  issuer: string;
}) {
  const redirectUri = validateExtensionRedirectUri(input.redirectUri);
  const codeChallenge = validateExtensionCodeChallenge(input.codeChallenge);
  const code = randomUrlSafeString();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXTENSION_GRANT_TTL_MS);
  const grant: StoredExtensionGrant = {
    version: EXTENSION_GRANT_VERSION,
    userId: input.userId,
    redirectUri,
    codeChallenge,
    issuer: input.issuer,
  };

  await db.insert(verification).values({
    id: grantRecordId(code),
    identifier: EXTENSION_GRANT_PREFIX,
    value: JSON.stringify(grant),
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  return { code, expiresAt };
}

export async function exchangeExtensionGrant(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  if (
    !GRANT_CODE_PATTERN.test(input.code) ||
    !PKCE_VALUE_PATTERN.test(input.codeVerifier)
  ) {
    throw new InvalidExtensionGrantError("The extension grant is invalid");
  }

  let redirectUri: string;
  try {
    redirectUri = validateExtensionRedirectUri(input.redirectUri);
  } catch {
    throw new InvalidExtensionGrantError("The extension grant is invalid");
  }

  return db.transaction(async (transaction) => {
    const stored = await transaction
      .select()
      .from(verification)
      .where(eq(verification.id, grantRecordId(input.code)))
      .get();
    const grant = stored ? parseStoredGrant(stored.value) : null;
    const grantIsValid =
      stored &&
      grant &&
      stored.expiresAt.getTime() > Date.now() &&
      grant.redirectUri === redirectUri &&
      grant.codeChallenge === sha256UrlSafe(input.codeVerifier);
    if (!stored || !grant || !grantIsValid) {
      throw new InvalidExtensionGrantError("The extension grant is invalid");
    }

    await transaction
      .delete(verification)
      .where(eq(verification.id, stored.id));

    const token = `${EXTENSION_TOKEN_PREFIX}${randomUrlSafeString()}`;
    const expiresAt = new Date(Date.now() + EXTENSION_SESSION_TTL_MS);
    await transaction.insert(extensionSession).values({
      tokenHash: sha256UrlSafe(token),
      userId: grant.userId,
      expiresAt,
    });

    return {
      token,
      expiresAt,
      userId: grant.userId,
      issuer: grant.issuer,
    };
  });
}

export async function findExtensionSession(token: string) {
  return db.query.extensionSession.findFirst({
    where: and(
      eq(extensionSession.tokenHash, sha256UrlSafe(token)),
      gt(extensionSession.expiresAt, new Date()),
    ),
  });
}

export async function revokeExtensionSession(token: string) {
  await db
    .delete(extensionSession)
    .where(eq(extensionSession.tokenHash, sha256UrlSafe(token)));
}
