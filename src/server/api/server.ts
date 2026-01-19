import { createRouterClient } from "@orpc/server";
import { getRequest } from "@tanstack/react-start/server";
import { auth } from "../auth";
import { db } from "../db";

import { orpcRouter } from "../orpc/router";

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
