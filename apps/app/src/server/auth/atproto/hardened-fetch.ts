import { safeFetchWrap } from "@atproto-labs/fetch-node";
import { env } from "~/env";

/**
 * SSRF-hardened outbound fetch shared by the AT Protocol OAuth client and
 * the typeahead proxy — standalone so consumers that only need a guarded
 * fetch don't pull in the OAuth client graph.
 *
 * Outside production (development and e2e) the guard loosens just enough
 * to reach a local dev PDS over plain HTTP.
 */

export const ALLOW_INSECURE_PDS = env.NODE_ENV !== "production";

const FETCH_TIMEOUT_MS = 15_000;

/** Explicit cap on protocol-document responses (DID docs, metadata). */
const RESPONSE_MAX_SIZE_BYTES = 512 * 1024;

export type HardenedFetch = (
  input: string | Request | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * The hardened fetch handed to the SDK. `safeFetchWrap`'s protocol, forbidden
 * domain, and size guards run once per call rather than per redirect hop, so a
 * followed redirect would reach its next hop unchecked — an https → http
 * downgrade slipping past `allowHttp: false`. Redirects are therefore never
 * followed: the SDK sets an explicit mode at each of its own call sites, but
 * its DPoP wrapper re-issues the request with no `init`, so the mode is
 * re-asserted here and anything asking to follow is downgraded to "error".
 *
 * `fetch` is injectable for tests only; production uses the global.
 * `allowInsecure` widens only the transport checks (http, private and IP
 * hosts) — the size cap and redirect ban always hold. The e2e stub-AppView
 * escape hatch forces it on for an authorized loopback origin.
 */
export function createHardenedFetch(
  fetch: HardenedFetch = globalThis.fetch,
  { allowInsecure = ALLOW_INSECURE_PDS }: { allowInsecure?: boolean } = {},
): HardenedFetch {
  const safeFetch = safeFetchWrap({
    fetch,
    timeout: FETCH_TIMEOUT_MS,
    responseMaxSize: RESPONSE_MAX_SIZE_BYTES,
    // Real-world PDS hosts may run on non-standard ports; private and
    // non-unicast addresses stay blocked in production.
    allowCustomPort: true,
    allowHttp: allowInsecure,
    allowPrivateIps: allowInsecure,
    allowIpHost: allowInsecure,
  });

  return (input, init) => {
    const requested =
      init?.redirect ?? (input instanceof Request ? input.redirect : undefined);
    return safeFetch(input, {
      ...init,
      redirect: requested === "manual" ? "manual" : "error",
    });
  };
}
