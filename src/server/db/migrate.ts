import { config } from "dotenv";
import { migrate } from "drizzle-orm/libsql/migrator";

// Load .env.local for local dev/build. In production the platform provides env
// vars directly; during e2e tests dotenv-cli injects them from .env.test.* files.
// Note: Nitro's Vite plugin auto-loads both .env AND .env.local in dev mode,
// so e2e test env files must explicitly empty-override any secrets from .env.local.
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
