"use client";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type React from "react";
import { getAsyncStoragePersister, getQueryClient } from "~/lib/query-client";

export function QueryProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: getAsyncStoragePersister() }}
    >
      {props.children}
    </PersistQueryClientProvider>
  );
}
