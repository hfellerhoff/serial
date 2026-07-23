import { env } from "~/env";

export const IS_DEMO_INSTANCE =
  env.VITE_PUBLIC_IS_DEMO_INSTANCE === "true" ||
  (typeof window === "undefined" && env.IS_DEMO_INSTANCE === "true");
