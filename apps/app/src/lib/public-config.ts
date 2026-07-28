import { createIsomorphicFn } from "@tanstack/react-start";
import SuperJSON from "superjson";
import { getServerPublicConfig } from "~/server/public-config.server";

export type PublicConfig = ReturnType<typeof getServerPublicConfig>;

export const SERIAL_PUBLIC_CONFIG_KEY = "__SERIAL_PUBLIC_CONFIG__";

type PublicConfigWindow = Window & {
  [SERIAL_PUBLIC_CONFIG_KEY]?: string | PublicConfig;
};

export function getBrowserPublicConfig(): PublicConfig {
  const publicConfigWindow = window as PublicConfigWindow;
  const storedPublicConfig = publicConfigWindow[SERIAL_PUBLIC_CONFIG_KEY];

  if (!storedPublicConfig) {
    throw new Error("Serial public configuration was not initialized.");
  }

  if (typeof storedPublicConfig !== "string") {
    return storedPublicConfig;
  }

  const publicConfig = SuperJSON.parse<PublicConfig>(storedPublicConfig);
  publicConfigWindow[SERIAL_PUBLIC_CONFIG_KEY] = publicConfig;
  return publicConfig;
}

const getPublicConfig = createIsomorphicFn()
  .server(getServerPublicConfig)
  .client(getBrowserPublicConfig);

export function getPublicConfigKey<TKey extends keyof PublicConfig>(
  key: TKey,
): PublicConfig[TKey] {
  return getPublicConfig()[key];
}

export function serializePublicConfig(publicConfig: PublicConfig): string {
  return SuperJSON.stringify(publicConfig);
}
