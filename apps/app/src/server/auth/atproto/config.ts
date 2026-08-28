import { createHmac } from "node:crypto";
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

export { ATPROTO_PROVIDER_ID } from "~/lib/constants";

/** The identity-only v1 scope; broader grants arrive via upgrade(). */
export const ATPROTO_SCOPE = "atproto";

/** Upper bound on the life of an in-flight authorization attempt. */
export const AUTH_STATE_TTL_MS = 60 * 60 * 1000;

/** Lazy so importing constants from this module never requires env. */
const baseUrl = () => env.PUBLIC_BASE_URL.replace(/\/$/, "");

/** Shared prefix for every atproto route; the rate-limit catch-all keys on it. */
export const ATPROTO_ROUTE_PREFIX = "/atproto/";

/**
 * Every atproto route, relative to the Better Auth mount (the form plugin
 * endpoints and policy classifiers see). `ATPROTO_PATHS` below is the same
 * set as absolute URL paths for the published client metadata — one source,
 * so a rename can't desynchronize the registered redirect_uris from the
 * routes and gates that serve them.
 */
export const ATPROTO_ROUTES = {
  clientMetadata: `${ATPROTO_ROUTE_PREFIX}client-metadata.json`,
  jwks: `${ATPROTO_ROUTE_PREFIX}jwks.json`,
  authorize: `${ATPROTO_ROUTE_PREFIX}authorize`,
  callback: `${ATPROTO_ROUTE_PREFIX}callback`,
} as const;

const AUTH_MOUNT = "/api/auth";

export const ATPROTO_PATHS = {
  clientMetadata: `${AUTH_MOUNT}${ATPROTO_ROUTES.clientMetadata}`,
  jwks: `${AUTH_MOUNT}${ATPROTO_ROUTES.jwks}`,
  callback: `${AUTH_MOUNT}${ATPROTO_ROUTES.callback}`,
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
    jwks.map(async (rawJwk, i) => {
      const jwk = normalizeJwk(rawJwk);
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

/**
 * Strip WebCrypto export artifacts. `key_ops: ["sign"]` on a private JWK is
 * interpreted by @atproto/jwk as public-key usage and would make the key
 * unusable for signing; `ext`/`use` are likewise noise for a server-held
 * signing keyset whose usage is fixed by context.
 */
function normalizeJwk(jwk: unknown): unknown {
  if (typeof jwk !== "object" || jwk === null) return jwk;
  const rest = { ...(jwk as Record<string, unknown>) };
  delete rest.key_ops;
  delete rest.ext;
  delete rest.use;
  return rest;
}

let storeKey: Buffer | null = null;

export function getStoreEncryptionKey(): Buffer {
  storeKey ??= parseEncryptionKey(env.ATPROTO_STORE_ENCRYPTION_KEY!);
  return storeKey;
}

/**
 * Parse both configured values eagerly so a malformed key fails startup
 * with its parse error instead of surfacing at the first user sign-in.
 * Called when the plugin is constructed (module init of the auth surface):
 * the store key parse throws synchronously into that import; the keyset
 * import is async, so its failure exits the process with the message.
 */
export function validateAtprotoConfigAtStartup(
  onKeysetError: (err: unknown) => void,
): void {
  getStoreEncryptionKey();
  getAtprotoKeyset().catch(onKeysetError);
}

/**
 * Deterministic internal placeholder email for a DID-only user. Never
 * surfaced in UI and never deliverable (`.invalid` is reserved). The suffix
 * is keyed with the instance secret so the address is not computable from
 * the (public) DID — Better Auth's account lookup falls back to email
 * matching, and a predictable address would let anyone squat a DID's slot
 * by registering it as a normal email account first. The keyed suffix also
 * keeps distinct DIDs collision-free after sanitizing.
 */
export function placeholderEmailForDid(did: string): string {
  const sanitized = did.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
  const suffix = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(did)
    .digest("hex")
    .slice(0, 16);
  return `${sanitized}.${suffix}@atproto.invalid`;
}
