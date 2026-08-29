import { z } from "zod";
import { createHardenedFetch } from "./client";
import { DID_PATTERN, HANDLE_PATTERN } from "./config";
import { env } from "~/env";
import { logError } from "~/server/logger";

/**
 * Serial-proxied actor typeahead for the auth-page handle field. The browser
 * only ever talks to Serial; this module forwards the search term (and
 * nothing else — no cookies, no identifying headers) to the configured
 * AppView's searchActorsTypeahead index. Suggestions are a convenience
 * layered over plain handle entry, so every failure path degrades to an
 * empty list rather than an error — logged, since a misconfigured upstream
 * would otherwise present as a permanently silent typeahead.
 */

const DEFAULT_APPVIEW_URL = "https://public.api.bsky.app";

export const TYPEAHEAD_LIMIT = 5;

/** Suggestions are worthless once the user has moved on; give up early. */
const TYPEAHEAD_TIMEOUT_MS = 5_000;

// Suggestions must already satisfy what the authorize endpoint accepts —
// a hostile upstream actor otherwise becomes a suggestion guaranteed to
// 400 on selection. The avatar URL lands in an <img src> in an
// unauthenticated visitor's browser, so only https survives — a rejected
// avatar drops alone (the actor renders avatar-less), and a malformed
// actor drops alone instead of voiding the whole suggestion list.
const upstreamActorSchema = z.object({
  did: z.string().max(512).regex(DID_PATTERN),
  handle: z.string().max(512).regex(HANDLE_PATTERN),
  displayName: z.string().max(640).optional(),
  avatar: z
    .url({ protocol: /^https$/ })
    .optional()
    .catch(undefined),
});

const upstreamResponseSchema = z.object({ actors: z.array(z.unknown()) });

export interface AtprotoActorSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

type TypeaheadFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * E2e escape hatch mirroring authorizedTestRssOrigin: the stub AppView
 * lives on loopback http, which the hardened fetch rejects in production
 * builds. The flag alone is not enough — a separate variable must name the
 * exact loopback http origin, and the configured AppView must match it
 * with no path, port games, or embedded credentials. Even then only the
 * transport checks loosen; the size cap and redirect ban stay.
 */
function authorizedTestAppviewOrigin(): URL | undefined {
  if (process.env.SERIAL_TEST_APPVIEW_ALLOW_LOOPBACK !== "1") return undefined;

  const configuredValue = process.env.SERIAL_TEST_APPVIEW_ORIGIN;
  if (!configuredValue) return undefined;

  try {
    const configured = new URL(configuredValue);
    if (
      configured.origin !== configuredValue ||
      configured.protocol !== "http:" ||
      (configured.hostname !== "127.0.0.1" && configured.hostname !== "[::1]")
    ) {
      return undefined;
    }
    return configured;
  } catch {
    return undefined;
  }
}

export function isAuthorizedTestAppview(appviewUrl: string): boolean {
  const configured = authorizedTestAppviewOrigin();
  if (!configured) return false;

  try {
    const target = new URL(appviewUrl);
    return (
      target.origin === configured.origin &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}

let defaultFetch: TypeaheadFetch | null = null;

function getDefaultFetch(): TypeaheadFetch {
  defaultFetch ??= createHardenedFetch(
    globalThis.fetch,
    isAuthorizedTestAppview(getAppviewUrl()) ? { allowInsecure: true } : {},
  );
  return defaultFetch;
}

export function getAppviewUrl(): string {
  return (env.ATPROTO_APPVIEW_URL ?? DEFAULT_APPVIEW_URL).replace(/\/$/, "");
}

/** `fetch` is injectable for tests only; production uses the hardened fetch. */
export async function searchAtprotoActorsTypeahead(
  term: string,
  fetch: TypeaheadFetch = getDefaultFetch(),
): Promise<AtprotoActorSuggestion[]> {
  const url = new URL(
    `${getAppviewUrl()}/xrpc/app.bsky.actor.searchActorsTypeahead`,
  );
  url.searchParams.set("q", term);
  url.searchParams.set("limit", String(TYPEAHEAD_LIMIT));

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TYPEAHEAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      logError("[atproto] typeahead upstream returned", response.status);
      return [];
    }

    const parsed = upstreamResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logError("[atproto] typeahead upstream body malformed:", parsed.error);
      return [];
    }

    // Deduped by DID: duplicates would collide as React keys and as the
    // option ids aria-activedescendant resolves against.
    const suggestions = new Map<string, AtprotoActorSuggestion>();
    for (const actor of parsed.data.actors) {
      if (suggestions.size >= TYPEAHEAD_LIMIT) break;
      const result = upstreamActorSchema.safeParse(actor);
      if (!result.success || suggestions.has(result.data.did)) continue;
      const { did, handle, displayName, avatar } = result.data;
      suggestions.set(did, {
        did,
        handle,
        ...(displayName ? { displayName } : {}),
        ...(avatar ? { avatar } : {}),
      });
    }
    return [...suggestions.values()];
  } catch (err) {
    logError("[atproto] typeahead failed:", err);
    return [];
  }
}
