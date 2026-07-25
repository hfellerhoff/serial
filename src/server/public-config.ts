import { createServerFn } from "@tanstack/react-start";
import { getServerPublicConfig } from "~/server/public-config.server";

export const fetchPublicConfig = createServerFn({ method: "GET" }).handler(
  getServerPublicConfig,
);
