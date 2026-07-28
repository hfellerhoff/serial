import { afterEach, describe, expect, it } from "vitest";
import { combineAbortSignals } from "../../../src/lib/data/combineAbortSignals";

const nativeAnyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "any");

afterEach(() => {
  if (nativeAnyDescriptor) {
    Object.defineProperty(AbortSignal, "any", nativeAnyDescriptor);
  }
});

describe("combineAbortSignals", () => {
  it("forwards aborts when AbortSignal.any is unavailable", () => {
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    });
    const lifecycle = new AbortController();
    const connection = new AbortController();

    const combined = combineAbortSignals([lifecycle.signal, connection.signal]);
    connection.abort("reconnect");

    expect(combined.signal.aborted).toBe(true);
    expect(combined.signal.reason).toBe("reconnect");
  });

  it("handles an already-aborted signal in the fallback", () => {
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    });
    const lifecycle = new AbortController();
    lifecycle.abort("unmounted");

    const combined = combineAbortSignals([
      lifecycle.signal,
      new AbortController().signal,
    ]);

    expect(combined.signal.aborted).toBe(true);
    expect(combined.signal.reason).toBe("unmounted");
  });

  it("stops forwarding after cleanup", () => {
    Object.defineProperty(AbortSignal, "any", {
      configurable: true,
      value: undefined,
    });
    const lifecycle = new AbortController();
    const combined = combineAbortSignals([lifecycle.signal]);

    combined.cleanup();
    lifecycle.abort();

    expect(combined.signal.aborted).toBe(false);
  });
});
