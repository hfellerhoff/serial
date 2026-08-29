import { z } from "zod";
import { createHardenedFetch } from "./client";
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

// The avatar URL lands in an <img src> in an unauthenticated visitor's
// browser, so only https survives; a malformed actor drops alone instead of
// voiding the whole suggestion list.
const upstreamActorSchema = z.object({
  did: z.string().max(512),
  handle: z.string().max(512),
  displayName: z.string().max(640).optional(),
  avatar: z.url({ protocol: /^https$/ }).optional(),
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
 * builds. Only an explicitly flagged loopback http origin bypasses it.
 */
function isAuthorizedTestAppview(appviewUrl: string): boolean {
  if (process.env.SERIAL_TEST_APPVIEW_ALLOW_LOOPBACK !== "1") return false;
  try {
    const parsed = new URL(appviewUrl);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

let defaultFetch: TypeaheadFetch | null = null;

function getDefaultFetch(): TypeaheadFetch {
  defaultFetch ??= isAuthorizedTestAppview(getAppviewUrl())
    ? (input, init) => globalThis.fetch(input, init)
    : createHardenedFetch();
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

    return parsed.data.actors
      .map((actor) => upstreamActorSchema.safeParse(actor))
      .filter((result) => result.success)
      .slice(0, TYPEAHEAD_LIMIT)
      .map(({ data: { did, handle, displayName, avatar } }) => ({
        did,
        handle,
        ...(displayName ? { displayName } : {}),
        ...(avatar ? { avatar } : {}),
      }));
  } catch (err) {
    logError("[atproto] typeahead failed:", err);
    return [];
  }
}
