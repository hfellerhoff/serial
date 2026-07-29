import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

const startUrl = process.env.SERIAL_EXTENSION_START_URL;

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  webExt: startUrl ? { startUrls: [startUrl] } : undefined,
  manifest: ({ manifestVersion }) => ({
    name: "Serial",
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvq3bqhiFWK5G3Yi3g200Rg8k9kXUjs4Vkqutz1+Pk5+aKWjWKjnXG+pjG7eUyIq7wspsXHrJQcOV7RDRoWuVT0oTYok7J+kyYDGxZMHc5VS9ZADVKlvhB7HuM8pBE4HvU6dGu4sskAznN8co6XtTx0bZZyX+xp1R5EGncBUtycvc1BB93TRd2G29dLs5Cb/ek3zMk0pqrmNEgrZnLCNu536Oa5ViYJVWEZeg/qa3+rhE+cDux4pU9nRFE63p5TOb+dGmziQk89xKvsmS53P+CZPgzpXXhBnlHFjlC7O3pKn8W4TCxbhnPB7C3H+BzLzf10ZtKZeJri+h7Zsf/tA52QIDAQAB",
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
        id: "extension@serial.tube",
        // Keep this declaration in sync when the extension starts transmitting data.
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  }),
});
