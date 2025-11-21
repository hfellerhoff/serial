import { headers as getNextHeaders } from "next/headers";
import { auth } from "../auth";
import { db } from "../db";

import { createRouterClient } from "@orpc/server";
import { orpcRouter } from "../orpc/router";

export const getServerApi = async () => {
  const headers = await getNextHeaders();

  const authData = await auth.api.getSession({
    headers,
  });

  const client = createRouterClient(orpcRouter, {
    context: {
      headers,
      session: authData?.session,
      user: authData?.user,
      db,
    },
  });

  return client;
};
