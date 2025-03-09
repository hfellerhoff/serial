import { appRouter } from "./root";
import { headers } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { db } from "../db";

export const getServerApi = async () => {
  return appRouter.createCaller({
    headers: await headers(),
    auth: await auth(),
    db,
  });
};
