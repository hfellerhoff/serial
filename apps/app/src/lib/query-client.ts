import {
  defaultShouldDehydrateQuery,
  QueryClient as TanstackQueryClient,
} from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import SuperJSON from "superjson";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";

export const createQueryClient = () =>
  new TanstackQueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      mutations: {
        onError: (err) => {
          try {
            // @ts-expect-error deal with this later
            JSON.parse(err.message).forEach((error: { message: string }) => {
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
        shouldRedactErrors: () => false,
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

const createSerialAsyncStoragePersister = () =>
  createAsyncStoragePersister({
    storage: typeof window === "undefined" ? undefined : window.localStorage,
  });

let asyncStoragePersister: Persister;
export const getAsyncStoragePersister = () => {
  if (typeof window === "undefined") return asyncStoragePersister;
  asyncStoragePersister = createSerialAsyncStoragePersister();
  return asyncStoragePersister;
};

let clientQueryClientSingleton: QueryClient | undefined;
export const getQueryClient = () => {
  if (typeof window === "undefined") return createQueryClient();
  clientQueryClientSingleton ??= createQueryClient();
  return clientQueryClientSingleton;
};
