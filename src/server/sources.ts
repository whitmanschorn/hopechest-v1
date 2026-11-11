import { getDb } from "@/lib/db";

export interface SourceRef {
  id: string;
  /** "Marriage licence of ..., 1965". */
  citation: string;
  /** The document in the chest it points at, when there is one. */
  documentId: string | null;
  /** An outside address, for sources that are not in the chest. */
  url: string | null;
}

/**
 * The sources a row of the family graph rests on: every accepted claim that
 * produced it. Callers check permissions before asking.
 */
export async function sourcesFor(
  appliedType: "event" | "person" | "relationship" | "place",
  appliedId: string,
): Promise<SourceRef[]> {
  const claims = await getDb().claim.findMany({
    where: { appliedType, appliedId, status: "ACCEPTED", sourceId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { source: { select: { id: true, citation: true, documentId: true, url: true } } },
  });
  const seen = new Map<string, SourceRef>();
  for (const { source } of claims) if (source) seen.set(source.id, source);
  return [...seen.values()];
}
