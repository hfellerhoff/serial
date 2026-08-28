import { describe, expect, it, vi } from "vitest";

/**
 * The hardened fetch handed to the SDK. Its SSRF, protocol, and size guards
 * run once per call rather than per redirect hop, so following a redirect
 * would carry the request to an unchecked destination. Nothing may be
 * followed implicitly, whatever mode the caller asked for.
 */

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/kv", () => ({ getKV: () => undefined }));

const { createHardenedFetch } = await import("~/server/auth/atproto/client");

function stubFetch() {
  return vi.fn((input: string | Request | URL, init?: RequestInit) => {
    void input;
    void init;
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
}

function receivedRequest(stub: ReturnType<typeof stubFetch>): Request {
  const input = stub.mock.calls[0]![0];
  if (!(input instanceof Request)) throw new Error("expected a Request");
  return input;
}

describe("createHardenedFetch", () => {
  it("downgrades an explicit follow to error", async () => {
    const stub = stubFetch();
    const fetch = createHardenedFetch(stub);

    await fetch("https://pds.example/xrpc/foo", { redirect: "follow" });

    expect(receivedRequest(stub).redirect).toBe("error");
  });

  it("downgrades a Request whose mode defaulted to follow", async () => {
    const stub = stubFetch();
    const fetch = createHardenedFetch(stub);

    // What the SDK's DPoP wrapper hands over: a Request, no init.
    await fetch(new Request("https://pds.example/xrpc/foo"));

    expect(receivedRequest(stub).redirect).toBe("error");
  });

  it("preserves manual, which the SDK's metadata resolvers rely on", async () => {
    const stub = stubFetch();
    const fetch = createHardenedFetch(stub);

    await fetch(
      new Request("https://pds.example/.well-known/x", {
        redirect: "manual",
      }),
    );

    expect(receivedRequest(stub).redirect).toBe("manual");
  });

  it("carries the request through unchanged otherwise", async () => {
    const stub = stubFetch();
    const fetch = createHardenedFetch(stub);

    await fetch(
      new Request("https://pds.example/xrpc/com.atproto.server.getSession", {
        method: "POST",
        headers: { DPoP: "proof-value" },
        redirect: "error",
      }),
    );

    const request = receivedRequest(stub);
    expect(request.method).toBe("POST");
    expect(request.headers.get("DPoP")).toBe("proof-value");
    expect(request.url).toBe(
      "https://pds.example/xrpc/com.atproto.server.getSession",
    );
  });

  it("blocks non-http protocols", async () => {
    const stub = stubFetch();
    const fetch = createHardenedFetch(stub);

    await expect(fetch("file:///etc/passwd")).rejects.toThrow();
    expect(stub).not.toHaveBeenCalled();
  });
});
