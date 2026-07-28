import { createServerFn } from "@tanstack/react-start";
import { getServerPublicConfigPayload } from "~/server/public-config.server";

export const fetchPublicConfig = createServerFn({ method: "GET" }).handler(
  getServerPublicConfigPayload,
);
