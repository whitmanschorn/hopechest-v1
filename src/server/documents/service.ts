import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { chunkMarkdown } from "@/lib/documents/chunk";
import {
  HIT_END,
  HIT_START,
  isKind,
  MAX_TEXT_LENGTH,
  tidyText,
  titleFromFilename,
  type DocumentKindName,
} from "@/lib/documents/kinds";
import { fromColumns, parseFuzzyDate, toColumns, type FuzzyDate } from "@/lib/fuzzyDate";
import {
  contentTypeForKey,
  fileUrl,
  isDocumentFileKey,
  keyFromUrl,
  MAX_UPLOAD_BYTES,
} from "@/lib/photos/keys";
import { assertCan, can, type Actor } from "@/server/actor";
import { getStorage } from "@/server/storage";
import { extractText } from "./extract";

export interface DocumentView {
  id: string;
  title: string;
  /** "record", "letter", "article"... */
  kind: string;
  date: FuzzyDate | null;
  text: string | null;
  /** A picture of the original paper, when the chest holds one. */
  scanUrl: string | null;
  /** The original file when it is not a picture: a PDF or a text file. */
  fileUrl: string | null;
  /** Where it was copied from, for documents that came from outside the family. */
  originalUrl: string | null;
  /** How to cite it, with any licence it carries. */
  citation: string | null;
  /** Whether the caller may change or delete it. */
  canEdit: boolean;
  /** True while it sits in the review queue, unseen by the rest of the family. */
  waiting: boolean;
  /** How many recorded facts cite it. It cannot be deleted while any do. */
  citedBy: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDocument(actor: Actor, id: string): Promise<DocumentView | null> {
  assertCan(actor, "read");
  if (!UUID.test(id)) return null;
  const doc = await getDb().document.findFirst({
    // One still in the review queue is only for the people who review.
    where: { id, ...(can(actor, "write") ? {} : { status: "PUBLISHED" }) },
    include: { sources: { select: { citation: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!doc) return null;
  const citedBy = await getDb().claim.count({ where: { source: { documentId: id } } });
  const stored = doc.originalUrl?.startsWith("/api/files/") ? doc.originalUrl : null;
  const picture = doc.mimeType?.startsWith("image/") ?? false;
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind.toLowerCase(),
    date: fromColumns(doc),
    text: doc.text,
    scanUrl: stored && picture ? stored : null,
    fileUrl: stored && !picture ? stored : null,
    originalUrl: doc.originalUrl?.startsWith("https://") ? doc.originalUrl : null,
    citation: doc.sources[0]?.citation ?? null,
    canEdit: can(actor, "write"),
    waiting: doc.status !== "PUBLISHED",
    citedBy,
  };
}

export interface DocumentCard {
  id: string;
  title: string;
  kind: string;
  date: FuzzyDate | null;
  /** For a search: a passage with the matched words between HIT_START and HIT_END. */
  excerpt: string | null;
  /** False while nobody has typed out what a scanned page says. */
  hasText: boolean;
}

const LIST_LIMIT = 200;

type DateColumns = Parameters<typeof fromColumns>[0];

/**
 * Documents, by title, or the ones matching `q` with the best match first.
 * A search understands quoted phrases, OR, and a leading minus to leave a
 * word out, as a web search does.
 */
export async function listDocuments(
  actor: Actor,
  options: { q?: string; kind?: string } = {},
): Promise<{ documents: DocumentCard[]; total: number }> {
  assertCan(actor, "read");
  const db = getDb();
  const kind =
    options.kind && isKind(options.kind)
      ? (options.kind.toUpperCase() as Uppercase<DocumentKindName>)
      : null;
  const q = options.q?.trim().slice(0, 200) ?? "";

  if (!q) {
    const where = {
      status: "PUBLISHED" as const,
      ...(kind ? { kind } : {}),
    };
    const [rows, total] = await Promise.all([
      db.document.findMany({
        where,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: LIST_LIMIT,
        select: {
          id: true,
          title: true,
          kind: true,
          text: true,
          dateYear: true,
          dateMonth: true,
          dateDay: true,
          datePrecision: true,
          dateDisplay: true,
          dateDeduced: true,
          dateClue: true,
        },
      }),
      db.document.count({ where }),
    ]);
    return {
      total,
      documents: rows.map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind.toLowerCase(),
        date: fromColumns(row),
        excerpt: null,
        hasText: Boolean(row.text),
      })),
    };
  }

  const headline = `StartSel=${HIT_START}, StopSel=${HIT_END}, MaxFragments=2, MaxWords=26, MinWords=10, FragmentDelimiter=" … "`;
  const rows = await db.$queryRaw<
    (DateColumns & { id: string; title: string; kind: string; excerpt: string; hasText: boolean })[]
  >`
    SELECT d.id, d.title, d.kind::text AS kind,
           d.date_year AS "dateYear", d.date_month AS "dateMonth", d.date_day AS "dateDay",
           d.date_precision::text AS "datePrecision", d.date_display AS "dateDisplay",
           d.date_deduced AS "dateDeduced", d.date_clue AS "dateClue",
           d.text IS NOT NULL AS "hasText",
           ts_headline('english', coalesce(d.text, ''), query, ${headline}) AS excerpt
    FROM documents d, websearch_to_tsquery('english', ${q}) query
    WHERE d.status = 'PUBLISHED'
      AND d.search_vector @@ query
      AND (${kind}::text IS NULL OR d.kind::text = ${kind})
    ORDER BY ts_rank(d.search_vector, query) DESC, d.title ASC
    LIMIT ${LIST_LIMIT}
  `;
  return {
    total: rows.length,
    documents: rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind.toLowerCase(),
      date: fromColumns(row),
      // A match in the title alone leaves the passage without marks; show none.
      // (Section marks in the stored text are not for reading.)
      excerpt: row.excerpt.includes(HIT_START) ? row.excerpt.replace(/#{1,6} /g, "") : null,
      hasText: row.hasText,
    })),
  };
}

export interface DocumentFormInput {
  title: string;
  kind: string;
  /** Free text read by parseFuzzyDate. */
  date: string;
  text: string;
}

export type DocumentErrors = Partial<Record<"title" | "kind" | "date" | "text" | "file", string>>;

function check(input: DocumentFormInput) {
  const errors: DocumentErrors = {};
  const title = input.title.trim();
  if (title.length > 200) errors.title = "Keep the title under 200 characters.";
  const given = input.kind.trim().toLowerCase() || "other";
  const kind: DocumentKindName = isKind(given) ? given : "other";
  if (!isKind(given)) errors.kind = "Choose what kind of document this is.";
  const date = parseFuzzyDate(input.date);
  if (date && date.year === undefined) {
    errors.date = 'Include a year, such as "1933-05-02", "1933" or "around 1933".';
  }
  const text = tidyText(input.text);
  if (text.length > MAX_TEXT_LENGTH) {
    errors.text = "That is longer than a document here can be. Split it into parts.";
  }
  return { errors, title, kind: kind.toUpperCase() as Uppercase<DocumentKindName>, date, text };
}

const chunkRows = (documentId: string, text: string | null) =>
  chunkMarkdown(text ?? "").map((chunk, position) => ({ documentId, position, ...chunk }));

export type CreateResult =
  { ok: true; id: string; duplicate: boolean } | { ok: false; errors: DocumentErrors };

/**
 * Adds a document from typed or pasted text, from an uploaded file, or both
 * (a scan with what it says typed out). The same file or text added twice
 * gives the document already in the chest.
 */
export async function createDocument(
  actor: Actor,
  input: DocumentFormInput & { fileKey?: string; filename?: string; review?: boolean },
): Promise<CreateResult> {
  assertCan(actor, "write");
  const { errors, kind, date, text: typed, ...checked } = check(input);
  const storage = getStorage();
  const fileKey = input.fileKey && isDocumentFileKey(input.fileKey) ? input.fileKey : null;
  const discard = () => (fileKey ? storage.delete([fileKey]).catch(() => undefined) : undefined);

  let bytes: Buffer | null = null;
  if (input.fileKey) {
    bytes = fileKey ? await storage.read(fileKey) : null;
    if (!bytes) errors.file = "That upload could not be found. Choose the file again.";
    else if (bytes.byteLength > MAX_UPLOAD_BYTES) errors.file = "That file is larger than 50 MB.";
  }
  const title = checked.title || titleFromFilename(input.filename ?? "");
  if (!title) errors.title = "Give the document a title.";
  if (!bytes && !typed && !errors.file) {
    errors.text = "Type or paste what the document says, or choose a file.";
  }

  let text: string | null = typed || null;
  const mimeType = fileKey ? contentTypeForKey(fileKey) : null;
  if (bytes && mimeType && !text && Object.keys(errors).length === 0) {
    try {
      text = await extractText(bytes, mimeType);
    } catch {
      errors.file = "That file could not be read. Is it a PDF, a text file or a picture?";
    }
    if (text && text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);
  }
  if (Object.keys(errors).length > 0) {
    await discard();
    return { ok: false, errors };
  }

  const sha256 = createHash("sha256")
    .update(bytes ?? `text:${typed}`)
    .digest("hex");
  const db = getDb();
  const existing = await db.document.findUnique({ where: { sha256 }, select: { id: true } });
  if (existing) {
    await discard();
    return { ok: true, id: existing.id, duplicate: true };
  }

  const id = crypto.randomUUID();
  await db.$transaction(async (tx) => {
    await tx.document.create({
      data: {
        id,
        sha256,
        kind,
        title,
        text,
        originalUrl: fileKey ? fileUrl(fileKey) : null,
        mimeType: mimeType ?? "text/plain",
        bytes: bytes?.byteLength ?? Buffer.byteLength(typed),
        uploadedById: actor.kind === "user" ? actor.userId : null,
        // Bulk arrivals wait in the review queue.
        status: input.review ? "NEEDS_REVIEW" : "PUBLISHED",
        ...toColumns(date),
      },
    });
    await tx.documentChunk.createMany({ data: chunkRows(id, text) });
    // What facts recorded from this document will point back to.
    await tx.source.create({ data: { kind: "DOCUMENT", documentId: id, citation: title } });
  });
  return { ok: true, id, duplicate: false };
}

/** Changes a document's details or its text (to correct it, or to type out a scan). */
export async function updateDocument(
  actor: Actor,
  id: string,
  input: DocumentFormInput,
): Promise<{ ok: true } | { ok: false; errors: DocumentErrors }> {
  assertCan(actor, "write");
  const { errors, title, kind, date, text } = check(input);
  if (!title) errors.title = "Give the document a title.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!UUID.test(id)) return { ok: true };

  await getDb().$transaction(async (tx) => {
    const current = await tx.document.findUnique({
      where: { id },
      select: { title: true, text: true, dateDisplay: true },
    });
    if (!current) return;
    await tx.document.update({
      where: { id },
      data: {
        title,
        kind,
        text: text || null,
        // An unchanged date keeps its "deduced" flag and clue.
        ...((date?.display ?? null) !== current.dateDisplay ? toColumns(date) : {}),
      },
    });
    if ((text || null) !== current.text) {
      await tx.documentChunk.deleteMany({ where: { documentId: id } });
      await tx.documentChunk.createMany({ data: chunkRows(id, text) });
    }
    // The plain citation follows the title; one written by hand is left alone.
    await tx.source.updateMany({
      where: { documentId: id, kind: "DOCUMENT", citation: current.title },
      data: { citation: title },
    });
  });
  return { ok: true };
}

/**
 * Deletes a document and its stored file. Refused while recorded facts cite
 * it: they would be left with nothing to show where they came from.
 */
export async function deleteDocument(
  actor: Actor,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return { ok: true };
  const db = getDb();
  const doc = await db.document.findUnique({ where: { id }, select: { originalUrl: true } });
  if (!doc) return { ok: true };
  const cited = await db.claim.count({ where: { source: { documentId: id } } });
  if (cited > 0) {
    return {
      ok: false,
      message:
        cited === 1
          ? "A recorded fact cites this document, so it cannot be deleted."
          : `${cited} recorded facts cite this document, so it cannot be deleted.`,
    };
  }
  await db.document.delete({ where: { id } });
  const key = doc.originalUrl ? keyFromUrl(doc.originalUrl) : null;
  if (key) {
    await getStorage()
      .delete([key])
      .catch((error) => console.error("Could not delete stored file", key, error));
  }
  return { ok: true };
}
