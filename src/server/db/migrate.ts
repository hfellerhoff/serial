import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";

// Load .env.local for local dev/build. In production the platform provides env
// vars directly; during e2e tests dotenv-cli injects them from .env.test.* files.
// Using .env.local (not .env) avoids c12/Nitro auto-loading secrets into tests.
config({ path: ".env.local" });

// Dynamic import so env vars are loaded before env.js evaluates process.env
const { db } = await import("./index.js");

migrate(db, { migrationsFolder: "src/server/db/migrations" })
  .then(() => {
    console.log("Migrations completed!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migrations failed!", err);
    process.exit(1);
  });
