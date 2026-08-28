import { z } from "zod";
import { createHardenedFetch } from "./client";
import { env } from "~/env";

/**
 * Serial-proxied actor typeahead for the auth-page handle field. The browser
 * only ever talks to Serial; this module forwards the search term (and
 * nothing else — no cookies, no identifying headers) to the configured
 * AppView's searchActorsTypeahead index. Suggestions are a convenience
 * layered over plain handle entry, so every failure path degrades to an
 * empty list rather than an error.
 */

const DEFAULT_APPVIEW_URL = "https://public.api.bsky.app";

export const TYPEAHEAD_LIMIT = 5;

/** Suggestions are worthless once the user has moved on; give up early. */
const TYPEAHEAD_TIMEOUT_MS = 5_000;

const upstreamResponseSchema = z.object({
  actors: z.array(
    z.object({
      did: z.string().max(512),
      handle: z.string().max(512),
      displayName: z.string().max(640).optional(),
      avatar: z.url().optional(),
    }),
  ),
});

export interface AtprotoActorSuggestion {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

type TypeaheadFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

let defaultFetch: TypeaheadFetch | null = null;

function getDefaultFetch(): TypeaheadFetch {
  defaultFetch ??= createHardenedFetch();
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
  const url = new URL(`${getAppviewUrl()}/xrpc/app.bsky.actor.searchActorsTypeahead`);
  url.searchParams.set("q", term);
  url.searchParams.set("limit", String(TYPEAHEAD_LIMIT));

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TYPEAHEAD_TIMEOUT_MS),
    });
    if (!response.ok) return [];

    const parsed = upstreamResponseSchema.safeParse(await response.json());
    if (!parsed.success) return [];

    return parsed.data.actors
      .slice(0, TYPEAHEAD_LIMIT)
      .map(({ did, handle, displayName, avatar }) => ({
        did,
        handle,
        ...(displayName ? { displayName } : {}),
        ...(avatar ? { avatar } : {}),
      }));
  } catch {
    return [];
  }
}
