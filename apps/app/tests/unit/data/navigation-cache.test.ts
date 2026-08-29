import { describe, expect, it } from "vitest";
import {
  getCacheableNavigationResponse,
  normalizeNavigationResponse,
} from "~/lib/pwa/navigation-cache";

const ROOT_URL = "https://app.example.com/";

function responseAt(url: string, init?: ResponseInit) {
  const response = new Response("shell", init);
  Object.defineProperty(response, "url", { value: url });
  return response;
}

describe("service-worker navigation cache", () => {
  it("rejects a transient server error instead of replacing the shell", () => {
    const response = new Response("unavailable", { status: 503 });

    expect(getCacheableNavigationResponse(ROOT_URL, response)).toBeNull();
  });

  it("keeps successful same-path responses cacheable", () => {
    const response = responseAt(ROOT_URL, { status: 200 });

    expect(getCacheableNavigationResponse(ROOT_URL, response)).toBe(response);
  });

  it("keeps synthetic responses without a URL cacheable", () => {
    const response = new Response("shell", { status: 200 });

    expect(getCacheableNavigationResponse(ROOT_URL, response)).toBe(response);
  });

  it("rejects a response that resolved at the sign-in page", () => {
    const response = responseAt("https://app.example.com/auth/sign-in", {
      status: 200,
    });
    Object.defineProperty(response, "redirected", { value: true });

    expect(getCacheableNavigationResponse(ROOT_URL, response)).toBeNull();
  });

  it("removes redirected response metadata from a valid shell", () => {
    const response = new Response("shell", { status: 200 });
    Object.defineProperty(response, "redirected", { value: true });

    const normalized = normalizeNavigationResponse(response);

    expect(normalized).not.toBe(response);
    expect(normalized.redirected).toBe(false);
    expect(normalized.status).toBe(200);
  });
});
