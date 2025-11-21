import { RPCHandler } from "@orpc/server/fetch";
import { onError } from "@orpc/server";
import { orpcRouter } from "~/server/orpc/router";
import { headers as getNextHeaders } from "next/headers";

import { db } from "~/server/db";
import { auth } from "~/server/auth";

const handler = new RPCHandler(orpcRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

async function handleRequest(request: Request) {
  const headers = new Headers(await getNextHeaders());

  const authResponse = await auth.api.getSession({
    headers,
  });

  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: {
      headers: headers,
      session: authResponse?.session,
      user: authResponse?.user,
      db,
    },
  });

  return response ?? new Response("Not found", { status: 404 });
}

export const HEAD = handleRequest;
export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;
