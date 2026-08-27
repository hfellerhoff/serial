"use client";

import { getDefaultStore, useAtomValue } from "jotai";
import { connectionStateAtom } from "./atoms";
import type { ConnectionState } from "./atoms";

export function canMutate(connectionState: ConnectionState) {
  return connectionState !== "disconnected";
}

export function canMutateNow() {
  return canMutate(getDefaultStore().get(connectionStateAtom));
}

export function useCanMutate() {
  return canMutate(useAtomValue(connectionStateAtom));
}
