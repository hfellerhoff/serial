"use client";

import { type QueryClient } from "@tanstack/react-query";
import {
  defaultShouldDehydrateQuery,
  QueryClient as TanstackQueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";
import { toast } from "sonner";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import {
  PersistQueryClientProvider,
  type Persister,
} from "@tanstack/react-query-persist-client";

export const createQueryClient = () =>
  new TanstackQueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      mutations: {
        onError: (err) => {
          try {
            // @ts-expect-error deal with this later
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument
            JSON.parse(err.message).forEach((error: { message: string }) => {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
              toast.error(error.message);
            });
          } catch {
            toast.error(err.message);
          }
        },
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

const createSerialAsyncStoragePersister = () => {
  return createAsyncStoragePersister({
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  });
};

let asyncStoragePersister: Persister;
export const getAsyncStoragePersister = () => {
  if (typeof window === "undefined") {
    return asyncStoragePersister;
  }
  return (asyncStoragePersister ??= createSerialAsyncStoragePersister());
};

let clientQueryClientSingleton: QueryClient | undefined = undefined;
export const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    return (clientQueryClientSingleton ??= createQueryClient());
  }
};

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
