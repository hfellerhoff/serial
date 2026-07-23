import { createServerFn } from "@tanstack/react-start";
import { publicConfigSchema } from "~/lib/public-config";

export const fetchPublicConfig = createServerFn({ method: "GET" }).handler(() =>
  publicConfigSchema.parse(process.env),
);
