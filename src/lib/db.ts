import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseHost, isLocalDatabase } from "./localDb";

// The app connects through the pooled URL; migrations use DATABASE_URL_UNPOOLED
// (see prisma.config.ts). One client is reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { hopechestDb?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  // Development and its specs write freely, so they may only ever reach a
  // database on this machine. (`vercel env pull` and some other Vercel
  // commands rewrite .env.local with a hosted database's address.)
  if (
    (process.env.HOPECHEST_ENV ?? "development") === "development" &&
    !isLocalDatabase(connectionString)
  ) {
    throw new Error(
      `HOPECHEST_ENV is "development" but DATABASE_URL points at ${databaseHost(connectionString)}. ` +
        "Development must use the local database: restore .env.local from .env.example.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazy, so importing this module never needs a database (builds, unit tests). */
export function getDb(): PrismaClient {
  globalForDb.hopechestDb ??= createClient();
  return globalForDb.hopechestDb;
}
