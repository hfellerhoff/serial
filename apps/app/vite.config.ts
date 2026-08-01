import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { z } from "zod";

function parseBooleanEnv(
  values: Array<string | undefined>,
  defaultValue: boolean,
) {
  const configuredValue = values.find(
    (value) => value !== undefined && value !== "",
  );
  return z.stringbool().parse(configuredValue ?? String(defaultValue));
}

const BACKGROUND_REFRESH_ENABLED = parseBooleanEnv(
  [process.env.BACKGROUND_REFRESH_ENABLED],
  true,
);

function scheduleTask(task: object, condition: boolean) {
  if (condition) {
    return task;
  }
  return {};
}

export default defineConfig(({ mode }) => {
  const isDemoBuild = mode === "demo";
  const isClientPerformanceBuild =
    process.env.SERIAL_CLIENT_PERFORMANCE_PRODUCTION === "1";
  const plugins = [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "app",
      },
      // spa: {
      //   enabled: true,
      // },
    }),
    nitro({
      preset: "node",
      serverDir: "server",
      experimental: { vite: {}, tasks: true },
      rollupConfig: { external: ["jsdom"] },
      rolldownConfig: { external: ["jsdom"] },
      scheduledTasks: {
        ...scheduleTask(
          { "* * * * *": ["feeds:background-refresh"] },
          BACKGROUND_REFRESH_ENABLED,
        ),
        ...scheduleTask({ "0 0 * * *": ["demo:midnight-wipe"] }, isDemoBuild),
      },
    }),
    viteReact(),
  ];

  // Add Sentry plugin only if auth token is present
  if (process.env.SENTRY_AUTH_TOKEN) {
    plugins.push(
      sentryTanstackStart({
        org: "megaflora",
        project: "javascript-tanstackstart-react",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      }),
    );
  }

  return {
    define: {
      __SERIAL_DEMO_BUILD__: JSON.stringify(isDemoBuild),
    },
    // During e2e tests, VITE_ENV_DIR redirects Vite's .env* loading away from
    // root so that only the test env file (loaded by dotenv-cli) takes effect.
    envDir: process.env.VITE_ENV_DIR ?? undefined,
    server: {
      port: 3000,
    },
    resolve: {
      alias: isClientPerformanceBuild
        ? { "react-dom/client": "react-dom/profiling" }
        : undefined,
      tsconfigPaths: true,
    },
    plugins,
  };
});
