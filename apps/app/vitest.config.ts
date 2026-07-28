import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Load test environment variables from .env.test instead of .env
config({ path: ".env.test" });

export default defineConfig({
  // Point envDir away from root so Vite/Vitest never loads the root .env
  envDir: "./tests",
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
