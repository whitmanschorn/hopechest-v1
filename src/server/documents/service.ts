import { getDb } from "@/lib/db";
import { fromColumns, type FuzzyDate } from "@/lib/fuzzyDate";
import { assertCan, type Actor } from "@/server/actor";

export interface DocumentView {
  id: string;
  title: string;
  /** "record", "letter", "article"... */
  kind: string;
  date: FuzzyDate | null;
  text: string | null;
  /** A picture of the original paper, when the chest holds one. */
  scanUrl: string | null;
  /** Where it was copied from, for documents that came from outside the family. */
  originalUrl: string | null;
  /** How to cite it, with any licence it carries. */
  citation: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDocument(actor: Actor, id: string): Promise<DocumentView | null> {
  assertCan(actor, "read");
  if (!UUID.test(id)) return null;
  const doc = await getDb().document.findFirst({
    where: { id, status: "PUBLISHED" },
    include: { sources: { select: { citation: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind.toLowerCase(),
    date: fromColumns(doc),
    text: doc.text,
    scanUrl:
      doc.originalUrl?.startsWith("/api/files/") && doc.mimeType?.startsWith("image/")
        ? doc.originalUrl
        : null,
    originalUrl: doc.originalUrl?.startsWith("https://") ? doc.originalUrl : null,
    citation: doc.sources[0]?.citation ?? null,
  };
}
