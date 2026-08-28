import { describe, expect, it } from "vitest";
import {
  getCacheableNavigationResponse,
  normalizeNavigationResponse,
} from "~/lib/pwa/navigation-cache";

describe("service-worker navigation cache", () => {
  it("rejects a transient server error instead of replacing the shell", () => {
    const response = new Response("unavailable", { status: 503 });

    expect(getCacheableNavigationResponse(response)).toBeNull();
  });

  it("keeps successful responses cacheable", () => {
    const response = new Response("shell", { status: 200 });

    expect(getCacheableNavigationResponse(response)).toBe(response);
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
