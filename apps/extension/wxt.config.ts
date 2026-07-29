import { defineConfig } from "wxt";

const startUrl = process.env.SERIAL_EXTENSION_START_URL;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  webExt: startUrl ? { startUrls: [startUrl] } : undefined,
  manifest: {
    name: "Serial",
    browser_specific_settings: {
      gecko: {
        id: "extension@serial.tube",
        // Keep this declaration in sync when the extension starts transmitting data.
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
});
