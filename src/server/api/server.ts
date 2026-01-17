import { auth } from "../auth";
import { db } from "../db";

import { createRouterClient } from "@orpc/server";
import { orpcRouter } from "../orpc/router";
import { getRequest } from "@tanstack/react-start/server";

export const getServerApi = async () => {
  const { headers } = getRequest();

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
