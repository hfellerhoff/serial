import { createServerFn } from "@tanstack/react-start";
import { resolvePublicConfig } from "~/lib/public-config";

export const fetchPublicConfig = createServerFn({ method: "GET" }).handler(() =>
  resolvePublicConfig({
    ...process.env,
    PUBLIC_IS_DEMO_INSTANCE: __SERIAL_DEMO_BUILD__,
  }),
);
