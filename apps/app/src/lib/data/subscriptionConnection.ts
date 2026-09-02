import { getDefaultStore } from "jotai";
import { connectionStateAtom } from "./atoms";

let connected = false;

export function isDataSubscriptionConnected() {
  return connected;
}

export function initializeDataSubscriptionConnection(isOnline: boolean) {
  if (!isOnline) {
    connected = false;
    getDefaultStore().set(connectionStateAtom, "disconnected");
  }
}

export function markDataSubscriptionConnected() {
  connected = true;
  getDefaultStore().set(connectionStateAtom, "connected");
}

export function markDataSubscriptionFailed({
  isOnline,
  isVisible,
}: {
  isOnline: boolean;
  isVisible: boolean;
}) {
  connected = false;
  if (!isOnline || isVisible) {
    getDefaultStore().set(connectionStateAtom, "disconnected");
  }
}

export function markDataSubscriptionPaused() {
  connected = false;
}
