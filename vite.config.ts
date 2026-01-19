import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import contentCollections from "@content-collections/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    contentCollections(),
    tailwindcss(),
    tsconfigPaths({
      projects: ["./tsconfig.json"],
    }),
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
    }),
    viteReact(),
    VitePWA({
      injectRegister: false,
      registerType: "prompt",
      manifest: {
        id: "serial",
        name: "Serial",
        short_name: "Serial",
        theme_color: "#fafaf9",
        background_color: "#0c0a09",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
          { src: "/icon-256.png", type: "image/png", sizes: "256x256" },
          {
            src: "/android-chrome-512x512.png",
            type: "image/png",
            sizes: "512x512",
            purpose: "any maskable",
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
