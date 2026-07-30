import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agent, fetch as undiciFetch } from "undici";
import { fetchStaticHtml } from "~/server/bookmarks/fetch";

function fakeDispatcher(close = vi.fn(() => Promise.resolve())) {
  return { dispatcher: { close } as unknown as Agent, close };
}

function mockDependencies(responses: Response[]) {
  const resolvedHostnames: string[] = [];
  const dispatchers: Array<ReturnType<typeof fakeDispatcher>> = [];
  const mockFetch = vi.fn(() => {
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch");
    return Promise.resolve(response);
  });
  return {
    resolvedHostnames,
    dispatchers,
    dependencies: {
      resolveAddresses: (hostname: string) => {
        resolvedHostnames.push(hostname);
        return Promise.resolve([{ address: "8.8.8.8", family: 4 }]);
      },
      createDispatcher: () => {
        const dispatcher = fakeDispatcher();
        dispatchers.push(dispatcher);
        return dispatcher.dispatcher;
      },
      fetch: mockFetch as unknown as typeof undiciFetch,
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("static Page capture fetch", () => {
  it("revalidates and repins every redirect target", async () => {
    const setup = mockDependencies([
      new Response(null, {
        status: 302,
        headers: { Location: "https://redirect.example/article" },
      }),
      new Response("<article>Content</article>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    ]);

    const result = await fetchStaticHtml(
      "https://origin.example/article",
      setup.dependencies,
    );
    expect(result).toEqual({
      ok: true,
      html: "<article>Content</article>",
      effectiveUrl: "https://redirect.example/article",
      redirectCount: 1,
    });
    expect(setup.resolvedHostnames).toEqual([
      "origin.example",
      "redirect.example",
    ]);
    expect(setup.dispatchers).toHaveLength(2);
    expect(
      setup.dispatchers.every(({ close }) => close.mock.calls.length === 1),
    ).toBe(true);
  });

  it("rejects responses after the decompressed byte ceiling", async () => {
    const body = new Uint8Array(5 * 1024 * 1024 + 1);
    const setup = mockDependencies([
      new Response(body, {
        headers: { "Content-Type": "text/html" },
      }),
    ]);
    await expect(
      fetchStaticHtml("https://example.com/article", setup.dependencies),
    ).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects non-HTML responses", async () => {
    const setup = mockDependencies([
      new Response("{}", {
        headers: { "Content-Type": "application/json" },
      }),
    ]);
    await expect(
      fetchStaticHtml("https://example.com/article", setup.dependencies),
    ).resolves.toEqual({ ok: false, reason: "not_html" });
  });

  it("enforces the response-header timeout", async () => {
    vi.useFakeTimers();
    const dispatcher = fakeDispatcher();
    const pendingFetch = vi.fn(
      (_target: unknown, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const resultPromise = fetchStaticHtml("https://example.com/article", {
      resolveAddresses: () =>
        Promise.resolve([{ address: "8.8.8.8", family: 4 }]),
      createDispatcher: () => dispatcher.dispatcher,
      fetch: pendingFetch as unknown as typeof undiciFetch,
    });
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: "timeout",
    });
  });

  it("enforces the total timeout while DNS resolution is pending", async () => {
    vi.useFakeTimers();
    const resultPromise = fetchStaticHtml("https://example.com/article", {
      resolveAddresses: () => new Promise(() => undefined),
      createDispatcher: () => fakeDispatcher().dispatcher,
      fetch: vi.fn() as unknown as typeof undiciFetch,
    });
    await vi.advanceTimersByTimeAsync(15_001);
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      reason: "timeout",
    });
  });
});
