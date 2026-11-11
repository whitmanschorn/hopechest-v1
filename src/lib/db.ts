import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// The app connects through the pooled URL; migrations use DATABASE_URL_UNPOOLED
// (see prisma.config.ts). One client is reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { hopechestDb?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Lazy, so importing this module never needs a database (builds, unit tests). */
export function getDb(): PrismaClient {
  globalForDb.hopechestDb ??= createClient();
  return globalForDb.hopechestDb;
}
