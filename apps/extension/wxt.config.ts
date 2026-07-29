import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import {
  CHROME_EXTENSION_MANIFEST_KEY,
  FIREFOX_EXTENSION_ID,
} from "@serial/extension-identity";

const startUrl = process.env.SERIAL_EXTENSION_START_URL;
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
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  webExt: startUrl ? { startUrls: [startUrl] } : undefined,
  manifest: ({ manifestVersion }) => ({
    name: "Serial",
    key: CHROME_EXTENSION_MANIFEST_KEY,
    icons: extensionIcons,
    ...(manifestVersion === 2
      ? { browser_action: { default_icon: extensionIcons } }
      : { action: { default_icon: extensionIcons } }),
    permissions: ["identity", "storage", "activeTab", "scripting"],
    optional_permissions:
      manifestVersion === 2
        ? ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]
        : undefined,
    optional_host_permissions:
      manifestVersion === 3
        ? ["https://*/*", "http://localhost/*", "http://127.0.0.1/*"]
        : undefined,
    browser_specific_settings: {
      gecko: {
        id: FIREFOX_EXTENSION_ID,
        strict_min_version: "140.0",
        data_collection_permissions: {
          required: ["authenticationInfo"],
        },
      },
    },
  }),
});
