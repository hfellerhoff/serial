import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { RouterClient } from "@orpc/server";
import type { orpcRouter } from "~/server/orpc/router";

const link = new RPCLink({
  url: `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/rpc`,
});

export const orpcRouterClient: RouterClient<typeof orpcRouter> =
  createORPCClient(link);
export const orpc = createTanstackQueryUtils(orpcRouterClient);
