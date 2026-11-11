// Replaces the local database with a copy of staging's, so local work starts
// from exactly what staging holds. Usage: node scripts/db-pull.ts
//
// Needs STAGING_DATABASE_URL (staging's direct, unpooled URL) in the
// environment or in .env.staging.local. Sign-in state is not copied.
// Uses the pg_dump and psql inside the local Postgres container.
import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { databaseHost, isLocalDatabase } from "./lib/localDb.ts";

loadEnv({ path: [".env.local", ".env.staging.local"], quiet: true });

const CONTAINER = "hopechest-pg";
const DUMP = "/tmp/staging.sql";
/** Tables whose rows stay behind: sessions, codes and keys are secrets. */
const NOT_COPIED = ["sessions", "verification_codes", "auth_attempts", "api_keys"];

function fail(message: string): never {
  console.error(`Refused: ${message}`);
  process.exit(1);
}

const source = process.env.STAGING_DATABASE_URL;
const target = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!source) fail("STAGING_DATABASE_URL is not set (see docs/deploying.md).");
if (isLocalDatabase(source)) fail("STAGING_DATABASE_URL points at this machine.");
if (!isLocalDatabase(target)) {
  fail(`db:pull only overwrites a database on this machine, not ${databaseHost(target)}.`);
}

function inContainer(script: string, env: Record<string, string> = {}): void {
  const flags = Object.keys(env).flatMap((key) => ["-e", key]);
  execFileSync("docker", ["exec", ...flags, CONTAINER, "sh", "-ec", script], {
    stdio: ["ignore", "inherit", "inherit"],
    // Values travel through the environment so they never show in a process list.
    env: { ...process.env, ...env },
  });
}

// Inside the container the local server listens on its default port.
const local = new URL(target!);
const psql = `psql -q -v ON_ERROR_STOP=1 -U "${local.username}" -d "${local.pathname.slice(1)}"`;
const skip = NOT_COPIED.map((table) => `--exclude-table-data=public.${table}`).join(" ");

try {
  // Download first: if this fails, the local database is untouched.
  console.log(`Downloading from ${databaseHost(source)}...`);
  inContainer(
    `pg_dump --no-owner --no-acl --schema=public --extension=vector ${skip} -f ${DUMP} "$SOURCE_URL"`,
    {
      SOURCE_URL: source!,
    },
  );
  console.log("Replacing the local database...");
  inContainer(
    `export PGOPTIONS="-c client_min_messages=warning"
     ${psql} -c "DROP SCHEMA IF EXISTS public CASCADE"
     ${psql} -f ${DUMP} > /dev/null`,
  );
} catch {
  console.error("Copy failed. If the local database was left incomplete, run `npm run db:reset`.");
  process.exitCode = 1;
} finally {
  inContainer(`rm -f ${DUMP}`);
}

if (!process.exitCode) {
  console.log("Local database now matches staging.");
  console.log("Run `npm run db:deploy` if this branch adds migrations.");
}
