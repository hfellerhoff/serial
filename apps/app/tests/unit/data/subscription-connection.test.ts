import { getDefaultStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { connectionStateAtom } from "~/lib/data/atoms";
import {
  initializeDataSubscriptionConnection,
  markDataSubscriptionConnected,
  markDataSubscriptionFailed,
  markDataSubscriptionPaused,
} from "~/lib/data/subscriptionConnection";

const store = getDefaultStore();

afterEach(() => store.set(connectionStateAtom, "unknown"));

describe("subscription connection state", () => {
  it("establishes an immediate offline state from the browser", () => {
    initializeDataSubscriptionConnection(false);
    expect(store.get(connectionStateAtom)).toBe("disconnected");
  });

  it("waits for a live connection before establishing connected", () => {
    initializeDataSubscriptionConnection(true);
    expect(store.get(connectionStateAtom)).toBe("unknown");

    markDataSubscriptionConnected();
    expect(store.get(connectionStateAtom)).toBe("connected");
  });

  it("marks a visible live connection failure as disconnected", () => {
    markDataSubscriptionConnected();
    markDataSubscriptionFailed({ isOnline: true, isVisible: true });
    expect(store.get(connectionStateAtom)).toBe("disconnected");
  });

  it("preserves the previous state for an intentional hidden pause", () => {
    markDataSubscriptionConnected();
    markDataSubscriptionPaused();
    markDataSubscriptionFailed({ isOnline: true, isVisible: false });
    expect(store.get(connectionStateAtom)).toBe("connected");
  });
});
