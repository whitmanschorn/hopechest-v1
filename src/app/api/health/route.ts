import { getDb } from "@/lib/db";

/** Liveness check: proves the deployment can reach its database and that
 * migrations have run. Returns no family data. */
export async function GET() {
  try {
    const rows = await getDb().$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    return Response.json({ ok: true, migrations: Number(rows[0]?.count ?? 0) });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
