import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Serial-proxied handle typeahead. The browser never talks to an
 * AppView directly: this module forwards the search term and nothing else,
 * and every upstream failure degrades to an empty suggestion list so plain
 * typed entry always stays available.
 */

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/kv", () => ({ getKV: () => undefined }));
vi.mock("~/server/logger", () => ({ logError: () => undefined }));
vi.mock("~/env", () => ({
  env: { NODE_ENV: "test", ATPROTO_APPVIEW_URL: undefined },
}));

const { env } = await import("~/env");
const {
  isAuthorizedTestAppview,
  searchAtprotoActorsTypeahead,
  TYPEAHEAD_LIMIT,
} = await import("~/server/auth/atproto/typeahead");

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
    const stub = stubFetch(jsonResponse({ error: "not actors" }));

    await expect(searchAtprotoActorsTypeahead("alice", stub)).resolves.toEqual(
      [],
    );
  });

  it("drops a malformed actor without voiding the rest", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: [{ handle: 42 }, { did: "did:plc:bob", handle: "bob.example" }],
      }),
    );

    await expect(searchAtprotoActorsTypeahead("bo", stub)).resolves.toEqual([
      { did: "did:plc:bob", handle: "bob.example" },
    ]);
  });

  it("strips non-https avatar URLs but keeps the actor", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: [
          {
            did: "did:plc:mallory",
            handle: "mallory.example",
            avatar: "javascript:alert(1)",
          },
          {
            did: "did:plc:alice",
            handle: "alice.example",
            avatar: "https://cdn.example/alice.jpg",
          },
        ],
      }),
    );

    await expect(searchAtprotoActorsTypeahead("al", stub)).resolves.toEqual([
      { did: "did:plc:mallory", handle: "mallory.example" },
      {
        did: "did:plc:alice",
        handle: "alice.example",
        avatar: "https://cdn.example/alice.jpg",
      },
    ]);
  });

  it("drops actors whose did or handle would fail the authorize schema", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: [
          { did: "https://evil.example/metadata", handle: "alice.example" },
          { did: "did:plc:alice", handle: "not a handle" },
          { did: "did:plc:bob", handle: "bob.example" },
        ],
      }),
    );

    await expect(searchAtprotoActorsTypeahead("al", stub)).resolves.toEqual([
      { did: "did:plc:bob", handle: "bob.example" },
    ]);
  });

  it("dedupes actors by did, keeping the first", async () => {
    const stub = stubFetch(
      jsonResponse({
        actors: [
          { did: "did:plc:alice", handle: "alice.example" },
          { did: "did:plc:alice", handle: "alice-alias.example" },
          { did: "did:plc:bob", handle: "bob.example" },
        ],
      }),
    );

    await expect(searchAtprotoActorsTypeahead("al", stub)).resolves.toEqual([
      { did: "did:plc:alice", handle: "alice.example" },
      { did: "did:plc:bob", handle: "bob.example" },
    ]);
  });

  it("degrades to no suggestions when the fetch itself fails", async () => {
    const stub = stubFetch(new Error("network unreachable"));

    await expect(searchAtprotoActorsTypeahead("alice", stub)).resolves.toEqual(
      [],
    );
  });
});

describe("isAuthorizedTestAppview", () => {
  const STUB_ORIGIN = "http://127.0.0.1:3009";

  function authorize(origin = STUB_ORIGIN) {
    vi.stubEnv("SERIAL_TEST_APPVIEW_ALLOW_LOOPBACK", "1");
    vi.stubEnv("SERIAL_TEST_APPVIEW_ORIGIN", origin);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses without the flag, even for a loopback origin", () => {
    vi.stubEnv("SERIAL_TEST_APPVIEW_ORIGIN", STUB_ORIGIN);
    expect(isAuthorizedTestAppview(STUB_ORIGIN)).toBe(false);
  });

  it("refuses the flag alone, with no origin named", () => {
    vi.stubEnv("SERIAL_TEST_APPVIEW_ALLOW_LOOPBACK", "1");
    expect(isAuthorizedTestAppview(STUB_ORIGIN)).toBe(false);
  });

  it("authorizes only the exact named loopback origin", () => {
    authorize();
    expect(isAuthorizedTestAppview(STUB_ORIGIN)).toBe(true);
    expect(isAuthorizedTestAppview("http://127.0.0.1:9999")).toBe(false);
    expect(isAuthorizedTestAppview("http://192.168.1.10:3009")).toBe(false);
  });

  it("refuses a non-loopback or https authorized origin outright", () => {
    authorize("http://appview.internal:3009");
    expect(isAuthorizedTestAppview("http://appview.internal:3009")).toBe(false);

    authorize("https://127.0.0.1:3009");
    expect(isAuthorizedTestAppview("https://127.0.0.1:3009")).toBe(false);
  });

  it("refuses an authorized value that is not a bare origin", () => {
    authorize(`${STUB_ORIGIN}/xrpc`);
    expect(isAuthorizedTestAppview(`${STUB_ORIGIN}/xrpc`)).toBe(false);
  });

  it("refuses embedded credentials and malformed URLs", () => {
    authorize();
    expect(isAuthorizedTestAppview("http://user:pass@127.0.0.1:3009")).toBe(
      false,
    );
    expect(isAuthorizedTestAppview("not a url")).toBe(false);
  });
});
