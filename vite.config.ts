import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import contentCollections from "@content-collections/vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
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
  ],
});
