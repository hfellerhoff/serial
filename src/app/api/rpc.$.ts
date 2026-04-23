import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { onError } from "@orpc/server";
import { orpcRouter } from "~/server/orpc/router";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { captureException } from "~/server/logger";

const handler = new RPCHandler(orpcRouter, {
  interceptors: [
    onError((error) => {
      captureException(error);
      console.error(error);
    }),
  ],
});

export const Route = createFileRoute("/api/rpc/$")({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const authResponse = await auth.api.getSession({
          headers: request.headers,
        });

        const { response } = await handler.handle(request, {
          prefix: "/api/rpc",
          context: {
            headers: request.headers,
            session: authResponse?.session,
            user: authResponse?.user,
            db,
          },
        });

        return response ?? new Response("Not Found", { status: 404 });
      },
    },
  },
});
