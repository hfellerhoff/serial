import { createHash } from "node:crypto";
import { JoseKey } from "@atproto/oauth-client-node";
import { parseEncryptionKey } from "./crypto";
import type { OAuthClientMetadataInput } from "@atproto/oauth-client-node";
import { env } from "~/env";

/**
 * Configuration surface for the AT Protocol OAuth client. Serial runs as a
 * confidential client only: ATPROTO_CLIENT_PRIVATE_KEYS holds a JSON array
 * of ES256 private JWKs (the keyset), and ATPROTO_STORE_ENCRYPTION_KEY the
 * base64 AES-256 key for the encrypted stores. Env validation guarantees
 * the pair is present together; the parsers here fail startup with a clear
 * message when either value is malformed.
 *
 * Rotation: prepend a fresh key to the keyset — the first key signs, older
 * keys stay published in the JWKS until in-flight grants drain, then drop
 * them. Generate a key with:
 *   node -e "crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']).then(async k=>console.log(JSON.stringify({kid:crypto.randomUUID(),...await crypto.subtle.exportKey('jwk',k.privateKey)})))"
 */

export const ATPROTO_PROVIDER_ID = "atproto";

/** The identity-only v1 scope; broader grants arrive via upgrade(). */
export const ATPROTO_SCOPE = "atproto";

/** Upper bound on the life of an in-flight authorization attempt. */
export const AUTH_STATE_TTL_MS = 60 * 60 * 1000;

/** Lazy so importing constants from this module never requires env. */
const baseUrl = () => env.PUBLIC_BASE_URL.replace(/\/$/, "");

export const ATPROTO_PATHS = {
  clientMetadata: "/api/auth/atproto/client-metadata.json",
  jwks: "/api/auth/atproto/jwks.json",
  callback: "/api/auth/atproto/callback",
} as const;

export function getAtprotoClientMetadata(): OAuthClientMetadataInput {
  const base = baseUrl();
  return {
    client_id: `${base}${ATPROTO_PATHS.clientMetadata}`,
    client_name: "Serial",
    client_uri: base,
    redirect_uris: [`${base}${ATPROTO_PATHS.callback}`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: ATPROTO_SCOPE,
    application_type: "web",
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    jwks_uri: `${base}${ATPROTO_PATHS.jwks}`,
  };
}

let keysetPromise: Promise<JoseKey[]> | null = null;

/**
 * Parse and import the confidential-client keyset. The first key signs;
 * every key is published in the JWKS.
 */
export function getAtprotoKeyset(): Promise<JoseKey[]> {
  if (!keysetPromise) {
    keysetPromise = importKeyset(env.ATPROTO_CLIENT_PRIVATE_KEYS!);
    keysetPromise.catch(() => {
      // Allow a retry after a transient failure rather than caching it.
      keysetPromise = null;
    });
  }
  return keysetPromise;
}

async function importKeyset(rawKeys: string): Promise<JoseKey[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    throw new Error(
      "ATPROTO_CLIENT_PRIVATE_KEYS must be a JSON array of ES256 private JWKs",
    );
  }
  const jwks = Array.isArray(parsed) ? parsed : [parsed];
  if (jwks.length === 0) {
    throw new Error(
      "ATPROTO_CLIENT_PRIVATE_KEYS must contain at least one key",
    );
  }
  return Promise.all(
    jwks.map(async (jwk, i) => {
      const fallbackKid =
        typeof jwk === "object" && jwk !== null && "kid" in jwk && jwk.kid
          ? undefined
          : `serial-atproto-${i}`;
      try {
        return await JoseKey.fromImportable(jwk as never, fallbackKid);
      } catch (cause) {
        throw new Error(
          `ATPROTO_CLIENT_PRIVATE_KEYS entry ${i} is not an importable private key`,
          { cause },
        );
      }
    }),
  );
}

let storeKey: Buffer | null = null;

export function getStoreEncryptionKey(): Buffer {
  storeKey ??= parseEncryptionKey(env.ATPROTO_STORE_ENCRYPTION_KEY!);
  return storeKey;
}

/**
 * Deterministic internal placeholder email for a DID-only user. Never
 * surfaced in UI and never deliverable (`.invalid` is reserved). The hash
 * suffix keeps distinct DIDs collision-free after sanitizing; DID lookup is
 * always by provider account id, never by this address.
 */
export function placeholderEmailForDid(did: string): string {
  const sanitized = did.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const suffix = createHash("sha256").update(did).digest("hex").slice(0, 8);
  return `${sanitized}.${suffix}@atproto.invalid`;
}
