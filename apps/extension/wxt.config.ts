import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import {
  CHROME_EXTENSION_MANIFEST_KEY,
  FIREFOX_EXTENSION_ID,
} from "@serial/extension-identity";

const startUrl = process.env.SERIAL_EXTENSION_START_URL;
const releaseVersion = process.env.SERIAL_EXTENSION_VERSION;
const isStoreBuild = process.env.SERIAL_EXTENSION_STORE_BUILD === "true";
const extensionIcons = {
  16: "icon/16.png",
  32: "icon/32.png",
  48: "icon/48.png",
  96: "icon/96.png",
  128: "icon/128.png",
};

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: {
    sourcesRoot: fileURLToPath(new URL("../..", import.meta.url)),
    excludeSources: ["**/*"],
    includeSources: [
      ".gitignore",
      ".node-version",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "turbo.json",
      "apps/extension/README.md",
      "apps/extension/package.json",
      "apps/extension/tsconfig.json",
      "apps/extension/wxt.config.ts",
      "apps/extension/assets/**",
      "apps/extension/entrypoints/**",
      "apps/extension/lib/**",
      "apps/extension/public/**",
      "packages/bookmark-capture/package.json",
      "packages/bookmark-capture/tsconfig.json",
      "packages/bookmark-capture/src/**",
      "packages/extension-identity/package.json",
      "packages/extension-identity/tsconfig.json",
      "packages/extension-identity/src/**",
      "packages/ui/package.json",
      "packages/ui/tsconfig.json",
      "packages/ui/src/**",
    ],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  webExt: startUrl ? { startUrls: [startUrl] } : undefined,
  manifest: ({ manifestVersion }) => ({
    name: "Serial",
    ...(releaseVersion ? { version: releaseVersion } : {}),
    ...(!isStoreBuild ? { key: CHROME_EXTENSION_MANIFEST_KEY } : {}),
    icons: extensionIcons,
    ...(manifestVersion === 2
      ? { browser_action: { default_icon: extensionIcons } }
      : { action: { default_icon: extensionIcons } }),
    permissions: ["identity", "storage", "activeTab", "scripting"],
    optional_permissions:
      manifestVersion === 2
        ? [
            "https://*/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "http://[::1]/*",
          ]
        : undefined,
    optional_host_permissions:
      manifestVersion === 3
        ? [
            "https://*/*",
            "http://localhost/*",
            "http://127.0.0.1/*",
            "http://[::1]/*",
          ]
        : undefined,
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_EXTENSION_ID,
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: [
            "authenticationInfo",
            "browsingActivity",
            "websiteActivity",
            "websiteContent",
          ],
        },
      },
    },
  }),
});
