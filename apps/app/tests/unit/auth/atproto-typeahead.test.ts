import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Serial-proxied handle typeahead. The browser never talks to an
 * AppView directly: this module forwards the search term and nothing else,
 * and every upstream failure degrades to an empty suggestion list so plain
 * typed entry always stays available.
 */

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/kv", () => ({ getKV: () => undefined }));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", ATPROTO_APPVIEW_URL: undefined },
}));

const { env } = await import("~/env");
const { searchAtprotoActorsTypeahead, TYPEAHEAD_LIMIT } = await import(
  "~/server/auth/atproto/typeahead"
);

type MutableEnv = { ATPROTO_APPVIEW_URL: string | undefined };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(response: Response | Error) {
  return vi.fn((input: string, init?: RequestInit) => {
    void input;
    void init;
    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve(response);
  });
}

afterEach(() => {
  (env as unknown as MutableEnv).ATPROTO_APPVIEW_URL = undefined;
});

describe("searchAtprotoActorsTypeahead", () => {
  it("sends only the term and limit to the default AppView", async () => {
    const stub = stubFetch(jsonResponse({ actors: [] }));

    await searchAtprotoActorsTypeahead("alice ex", stub);

    const [input, init] = stub.mock.calls[0]!;
    const url = new URL(input);
    expect(url.origin).toBe("https://public.api.bsky.app");
    expect(url.pathname).toBe("/xrpc/app.bsky.actor.searchActorsTypeahead");
    expect([...url.searchParams.keys()].sort()).toEqual(["limit", "q"]);
    expect(url.searchParams.get("q")).toBe("alice ex");
    expect(url.searchParams.get("limit")).toBe(String(TYPEAHEAD_LIMIT));
    expect(init?.headers).toEqual({ accept: "application/json" });
  });

  it("respects the configured AppView, trimming a trailing slash", async () => {
    (env as unknown as MutableEnv).ATPROTO_APPVIEW_URL =
      "https://appview.example/";
    const stub = stubFetch(jsonResponse({ actors: [] }));

    await searchAtprotoActorsTypeahead("alice", stub);

    expect(stub.mock.calls[0]![0]).toBe(
      `https://appview.example/xrpc/app.bsky.actor.searchActorsTypeahead?q=alice&limit=${TYPEAHEAD_LIMIT}`,
    );
  });

  it("maps actors down to the suggestion shape", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: [
          {
            did: "did:plc:alice",
            handle: "alice.example",
            displayName: "Alice",
            avatar: "https://cdn.example/alice.jpg",
            viewer: { muted: false },
            labels: [],
          },
          { did: "did:plc:bob", handle: "bob.example" },
        ],
      }),
    );

    const actors = await searchAtprotoActorsTypeahead("ali", stub);

    expect(actors).toEqual([
      {
        did: "did:plc:alice",
        handle: "alice.example",
        displayName: "Alice",
        avatar: "https://cdn.example/alice.jpg",
      },
      { did: "did:plc:bob", handle: "bob.example" },
    ]);
  });

  it("caps the suggestion count even when upstream over-delivers", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: Array.from({ length: TYPEAHEAD_LIMIT + 3 }, (_, i) => ({
          did: `did:plc:actor${i}`,
          handle: `actor${i}.example`,
        })),
      }),
    );

    const actors = await searchAtprotoActorsTypeahead("actor", stub);

    expect(actors).toHaveLength(TYPEAHEAD_LIMIT);
  });

  it("degrades to no suggestions on an upstream error status", async () => {
    const stub = stubFetch(jsonResponse({ error: "InternalError" }, 502));

    await expect(searchAtprotoActorsTypeahead("alice", stub)).resolves.toEqual(
      [],
    );
  });

  it("degrades to no suggestions on a malformed body", async () => {
    const stub = stubFetch(jsonResponse({ actors: [{ handle: 42 }] }));

    await expect(searchAtprotoActorsTypeahead("alice", stub)).resolves.toEqual(
      [],
    );
  });

  it("degrades to no suggestions when the fetch itself fails", async () => {
    const stub = stubFetch(new Error("network unreachable"));

    await expect(searchAtprotoActorsTypeahead("alice", stub)).resolves.toEqual(
      [],
    );
  });
});
