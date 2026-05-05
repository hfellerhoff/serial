import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";
import type { orpcRouter } from "~/server/orpc/router";
import { env } from "~/env";

const link = new RPCLink({
  url: `${typeof window !== "undefined" ? window.location.origin : env.VITE_PUBLIC_BASE_URL}/api/rpc`,
});

export const orpcRouterClient: RouterClient<typeof orpcRouter> =
  createORPCClient(link);
export const orpc = createTanstackQueryUtils(orpcRouterClient);
