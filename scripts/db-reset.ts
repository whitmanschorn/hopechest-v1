// Erases the local database, re-applies every migration and loads the Bluth
// seed. Usage: node scripts/db-reset.ts
import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { databaseHost, isLocalDatabase } from "./lib/localDb.ts";

loadEnv({ path: ".env.local", quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!isLocalDatabase(url)) {
  console.error(
    `Refused: db:reset only erases a database on this machine, not ${databaseHost(url)}.`,
  );
  process.exit(1);
}

// Prisma stops here when an AI agent runs this and asks for the owner's
// consent; that is intended. Agents rarely need a reset: db:seed repairs seeded rows.
try {
  execFileSync("npx", ["prisma", "migrate", "reset", "--force"], { stdio: "inherit" });
  execFileSync("node", ["scripts/seed.ts"], { stdio: "inherit" });
} catch {
  process.exit(1);
}
