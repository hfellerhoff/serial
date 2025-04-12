import { appRouter } from "./root";
import { headers as getNextHeaders } from "next/headers";
import { db } from "../db";
import { auth } from "../auth";

export const getServerApi = async () => {
  const headers = await getNextHeaders();

  return appRouter.createCaller({
    headers,
    auth: await auth.api.getSession({
      headers,
    }),
    db,
  });
};
