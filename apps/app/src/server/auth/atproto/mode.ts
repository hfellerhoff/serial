import { env } from "~/env";

/**
 * How this instance's AT Protocol OAuth client can present itself, derived
 * entirely from PUBLIC_BASE_URL (the base of the published client metadata):
 *
 * - "confidential": an https base URL — the production shape (private_key_jwt
 *   against the ES256 keyset, discoverable client metadata).
 * - "loopback": a plain-http loopback base URL — the SDK's RFC 8252
 *   development client (`http://localhost` client_id, auth method "none"),
 *   so the full OAuth round trip is testable locally. Not gated on
 *   NODE_ENV: a loopback base URL is only ever reachable from the machine
 *   serving the app (production-mode local builds, e2e preview servers
 *   included), and no public deployment can have one.
 * - "unavailable": anything else — the SDK would reject the client metadata
 *   at construction, so atproto must report not-configured rather than
 *   render flows that can only fail at the authorize step.
 *
 * Kept free of SDK imports: isAtprotoConfigured() consults this on surfaces
 * that must not pull the atproto SDK onto the module graph.
 */
export type AtprotoClientMode = "confidential" | "loopback" | "unavailable";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function getAtprotoClientMode(): AtprotoClientMode {
  let url: URL;
  try {
    url = new URL(env.PUBLIC_BASE_URL);
  } catch {
    return "unavailable";
  }
  if (url.protocol === "https:" && !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return "confidential";
  }
  if (url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname)) {
    return "loopback";
  }
  return "unavailable";
}
