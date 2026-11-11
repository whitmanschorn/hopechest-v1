import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js reads .env.local at runtime, but the Prisma CLI does not.
loadEnv({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need a direct connection; the app uses the pooled DATABASE_URL.
  // Undefined is fine here so `prisma generate` works without a database.
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
