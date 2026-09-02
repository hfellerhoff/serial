"use client";

import type { PropsWithChildren } from "react";
import { useCanMutate } from "~/lib/data/offline-mutations";

export function OfflineMutationBoundary({ children }: PropsWithChildren) {
  const canMutate = useCanMutate();
  return (
    <fieldset className="contents" disabled={!canMutate}>
      {children}
    </fieldset>
  );
}
