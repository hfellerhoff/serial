import contentCollections from "@content-collections/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const plugins = [
  contentCollections(),
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
    experimental: { vite: {}, tasks: true } as any,
    scheduledTasks: { "* * * * *": ["feeds:background-refresh"] },
  } as any),
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

export default defineConfig({
  // During e2e tests, VITE_ENV_DIR redirects Vite's .env* loading away from
  // root so that only the test env file (loaded by dotenv-cli) takes effect.
  envDir: process.env.VITE_ENV_DIR ?? undefined,
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins,
});
