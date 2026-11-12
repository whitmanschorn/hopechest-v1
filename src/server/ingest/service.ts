import { getDb } from "@/lib/db";
import { parseFuzzyDate, toColumns } from "@/lib/fuzzyDate";
import { matchPerson, parseSidecar, type Sidecar } from "@/lib/ingest/sidecar";
import { assertCan, type Actor } from "@/server/actor";
import {
  cardFields,
  deletePhoto,
  registerPhoto,
  toCard,
  type PhotoCard,
} from "@/server/photos/service";
import { getStorage } from "@/server/storage";

/**
 * Bulk arrivals. A batch is one run of bringing files in (a folder of slide
 * scans, a Facebook export); each file is an item. Photos that arrive this way
 * wait in the review queue until someone publishes them.
 */

export const SOURCES = ["folder", "scan", "facebook_export", "facebook_capture"] as const;
export type SourceName = (typeof SOURCES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export interface BatchCounts {
  /** Photos in the review queue. */
  waiting: number;
  published: number;
  /** Files that were already in the chest. */
  duplicates: number;
  failed: number;
  /** Photos someone threw out during review. */
  discarded: number;
}

export interface BatchSummary {
  id: string;
  label: string;
  source: string;
  /** False once whoever was sending files said they were done. */
  open: boolean;
  startedAt: Date;
  startedBy: string | null;
  counts: BatchCounts;
}

export interface ReviewPhoto extends PhotoCard {
  filename: string | null;
  people: { slug: string; displayName: string }[];
  /** What could not be applied from the details that came with the file. */
  problems: string[];
}

export interface BatchDetail extends BatchSummary {
  waiting: ReviewPhoto[];
  failed: { filename: string | null; error: string }[];
}

const summaryInclude = {
  createdByUser: { select: { person: { select: { displayName: true } } } },
  createdByApiKey: { select: { name: true } },
  items: { select: { status: true, photo: { select: { status: true } } } },
} as const;

type SummaryRow = {
  id: string;
  label: string;
  source: string;
  status: string;
  createdAt: Date;
  createdByUser: { person: { displayName: string } | null } | null;
  createdByApiKey: { name: string } | null;
  items: { status: string; photo: { status: string } | null }[];
};

function summarise(batch: SummaryRow): BatchSummary {
  const counts: BatchCounts = { waiting: 0, published: 0, duplicates: 0, failed: 0, discarded: 0 };
  for (const item of batch.items) {
    if (item.status === "DUPLICATE") counts.duplicates++;
    else if (item.status === "FAILED") counts.failed++;
    else if (!item.photo) counts.discarded++;
    else if (item.photo.status === "PUBLISHED") counts.published++;
    else counts.waiting++;
  }
  return {
    id: batch.id,
    label: batch.label,
    source: batch.source.toLowerCase(),
    open: batch.status === "OPEN",
    startedAt: batch.createdAt,
    startedBy: batch.createdByUser?.person?.displayName ?? batch.createdByApiKey?.name ?? null,
    counts,
  };
}

const creator = (actor: Actor) =>
  actor.kind === "user" ? { createdByUserId: actor.userId } : { createdByApiKeyId: actor.apiKeyId };

export type OpenResult =
  | { ok: true; batch: BatchSummary; resumed: boolean; upload: "blob" | "local" }
  | { ok: false; errors: Partial<Record<"label" | "source", string>> };

/**
 * Starts a batch, or picks up the caller's unfinished one with the same label,
 * so a run that was interrupted carries on where it stopped.
 */
export async function openBatch(
  actor: Actor,
  input: { label: string; source: string },
): Promise<OpenResult> {
  assertCan(actor, "ingest");
  const label = input.label.trim();
  const source = (input.source.trim().toLowerCase() || "folder") as SourceName;
  const errors: Partial<Record<"label" | "source", string>> = {};
  if (!label) errors.label = "Give the batch a name, such as the box the slides came from.";
  else if (label.length > 200) errors.label = "Keep the name under 200 characters.";
  if (!SOURCES.includes(source)) errors.source = `One of: ${SOURCES.join(", ")}.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const db = getDb();
  const key = { label, source: source.toUpperCase() as Uppercase<SourceName>, ...creator(actor) };
  const existing = await db.ingestBatch.findFirst({
    where: { ...key, status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: summaryInclude,
  });
  const batch = existing ?? (await db.ingestBatch.create({ data: key, include: summaryInclude }));
  return {
    ok: true,
    batch: summarise(batch),
    resumed: existing !== null,
    upload: getStorage().kind,
  };
}

/** Every batch, newest first. */
export async function listBatches(actor: Actor): Promise<BatchSummary[]> {
  assertCan(actor, "write");
  const batches = await getDb().ingestBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: summaryInclude,
  });
  // A run that found everything already in the chest left nothing to look at.
  return batches
    .map(summarise)
    .filter(({ open, counts }) => open || counts.duplicates === 0 || nonDuplicates(counts) > 0);
}

const nonDuplicates = (counts: BatchCounts) =>
  counts.waiting + counts.published + counts.failed + counts.discarded;

/** How many photos are waiting for review, across all batches. */
export async function countWaiting(actor: Actor): Promise<number> {
  assertCan(actor, "write");
  return getDb().photo.count({ where: { status: "NEEDS_REVIEW" } });
}

export async function getBatch(actor: Actor, id: string): Promise<BatchDetail | null> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return null;
  const db = getDb();
  const batch = await db.ingestBatch.findUnique({ where: { id }, include: summaryInclude });
  if (!batch) return null;
  const items = await db.ingestItem.findMany({
    where: {
      batchId: id,
      OR: [{ status: "FAILED" }, { status: "PROCESSED", photo: { status: "NEEDS_REVIEW" } }],
    },
    orderBy: [{ originalFilename: "asc" }, { id: "asc" }],
    select: {
      status: true,
      originalFilename: true,
      error: true,
      sidecar: true,
      photo: {
        select: {
          ...cardFields,
          people: {
            select: { person: { select: { slug: true, displayName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  return {
    ...summarise(batch),
    waiting: items
      .filter((item) => item.photo)
      .map((item) => ({
        ...toCard(item.photo!),
        filename: item.originalFilename,
        people: item.photo!.people.map((tag) => tag.person),
        problems: problemsOf(item.sidecar),
      })),
    failed: items
      .filter((item) => item.status === "FAILED")
      .map((item) => ({ filename: item.originalFilename, error: item.error ?? "Failed." })),
  };
}

function problemsOf(sidecar: unknown): string[] {
  const found = (sidecar as { problems?: unknown } | null)?.problems;
  return Array.isArray(found) ? found.filter((entry) => typeof entry === "string") : [];
}

export type ItemResult =
  | { ok: false; status: 404 | 409 | 422; message: string }
  | {
      ok: true;
      /**
       * "upload": the chest does not have this file, send it. "added": it is now
       * waiting for review. "duplicate": the chest had it already.
       * "failed": it arrived but could not be read as a picture.
       */
      state: "upload" | "added" | "duplicate" | "failed";
      photoId: string | null;
      problems: string[];
    };

/**
 * One file of a batch, in two steps so nothing is uploaded twice. First call
 * with the file's hash: the answer is "duplicate" or "upload". After uploading
 * the original, call again with its `key` to turn it into a photo.
 */
export async function addItem(
  actor: Actor,
  batchId: string,
  input: { sha256: string; filename?: string; sidecar?: unknown; key?: string },
): Promise<ItemResult> {
  assertCan(actor, "ingest");
  const sha256 = input.sha256.trim().toLowerCase();
  if (!SHA256.test(sha256)) {
    return { ok: false, status: 422, message: "sha256 must be the file's SHA-256 in hex." };
  }
  const db = getDb();
  const batch = UUID.test(batchId)
    ? await db.ingestBatch.findUnique({ where: { id: batchId }, select: { status: true } })
    : null;
  if (!batch) return { ok: false, status: 404, message: "There is no such batch." };
  if (batch.status !== "OPEN") {
    return { ok: false, status: 409, message: "That batch is finished. Start a new one." };
  }

  const filename = input.filename?.trim().slice(0, 200) || null;
  const where = { batchId_sha256: { batchId, sha256 } };
  const done = await db.ingestItem.findUnique({ where });
  if (done && done.status !== "FAILED") {
    return {
      ok: true,
      state: done.status === "DUPLICATE" ? "duplicate" : "added",
      photoId: done.photoId,
      problems: problemsOf(done.sidecar),
    };
  }

  const sidecar = parseSidecar(input.sidecar);
  const record = (data: {
    status: "PROCESSED" | "DUPLICATE" | "FAILED";
    photoId?: string | null;
    error?: string | null;
    problems?: string[];
  }) => {
    const fields = {
      kind: "PHOTO" as const,
      status: data.status,
      originalFilename: filename,
      photoId: data.photoId ?? null,
      error: data.error ?? null,
      sidecar: { ...sidecar, ...(data.problems?.length ? { problems: data.problems } : {}) },
    };
    return db.ingestItem.upsert({
      where,
      create: { batchId, sha256, ...fields },
      update: fields,
    });
  };

  if (!input.key) {
    const known = await db.photo.findUnique({ where: { sha256 }, select: { id: true } });
    if (!known) return { ok: true, state: "upload", photoId: null, problems: [] };
    await record({ status: "DUPLICATE", photoId: known.id });
    return { ok: true, state: "duplicate", photoId: known.id, problems: [] };
  }

  const result = await registerPhoto(actor, {
    key: input.key,
    filename: filename ?? undefined,
    review: true,
  });
  if (!result.ok) {
    await record({ status: "FAILED", error: result.message });
    return { ok: true, state: "failed", photoId: null, problems: [result.message] };
  }
  if (result.duplicate) {
    await record({ status: "DUPLICATE", photoId: result.id });
    return { ok: true, state: "duplicate", photoId: result.id, problems: [] };
  }
  const problems = await applySidecar(actor, result.id, sidecar);
  await record({ status: "PROCESSED", photoId: result.id, problems });
  return { ok: true, state: "added", photoId: result.id, problems };
}

/**
 * Writes what came with a file onto its new photo. Anything that cannot be
 * applied (a name nobody has, a date that cannot be read) is returned as a
 * sentence for the reviewer, never guessed at.
 */
async function applySidecar(actor: Actor, photoId: string, sidecar: Sidecar): Promise<string[]> {
  const problems: string[] = [];
  const db = getDb();

  const date = sidecar.date ? parseFuzzyDate(sidecar.date) : null;
  if (sidecar.date && date?.year === undefined) {
    problems.push(`Could not read the date "${sidecar.date}".`);
  }
  await db.photo.update({
    where: { id: photoId },
    data: {
      ...(sidecar.caption ? { caption: sidecar.caption } : {}),
      ...(sidecar.photographer ? { photographer: sidecar.photographer.slice(0, 200) } : {}),
      // A date given with the file is better than the camera's: scanners stamp the scan day.
      ...(date?.year !== undefined ? toColumns(date) : {}),
    },
  });

  if (sidecar.people?.length) {
    const everyone = await db.person.findMany({
      select: {
        id: true,
        slug: true,
        displayName: true,
        givenName: true,
        familyName: true,
        nicknames: true,
        alternateNames: true,
      },
    });
    const tagged = new Set<string>();
    for (const name of sidecar.people) {
      const match = matchPerson(name, everyone);
      if (match.found) tagged.add(match.person.id);
      else if (match.reason === "several") {
        problems.push(`More than one person is called "${name}".`);
      } else problems.push(`No one in the chest is called "${name}".`);
    }
    await db.photoPerson.createMany({
      data: [...tagged].map((personId) => ({
        photoId,
        personId,
        createdById: actor.kind === "user" ? actor.userId : null,
      })),
      skipDuplicates: true,
    });
  }

  if (sidecar.album) {
    const title = sidecar.album.slice(0, 120);
    const album =
      (await db.album.findFirst({
        where: { title: { equals: title, mode: "insensitive" } },
        select: { id: true },
      })) ?? (await db.album.create({ data: { title }, select: { id: true } }));
    const last = await db.albumPhoto.aggregate({
      where: { albumId: album.id },
      _max: { position: true },
    });
    await db.albumPhoto.upsert({
      where: { albumId_photoId: { albumId: album.id, photoId } },
      create: { albumId: album.id, photoId, position: (last._max.position ?? -1) + 1 },
      update: {},
    });
  }
  return problems;
}

/** Says that no more files are coming. The batch stays in the review queue. */
export async function completeBatch(actor: Actor, id: string): Promise<BatchSummary | null> {
  assertCan(actor, "ingest");
  if (!UUID.test(id)) return null;
  const db = getDb();
  const found = await db.ingestBatch.findUnique({ where: { id }, select: { status: true } });
  if (!found) return null;
  const batch = await db.ingestBatch.update({
    where: { id },
    data: found.status === "OPEN" ? { status: "COMPLETE", completedAt: new Date() } : {},
    include: summaryInclude,
  });
  return summarise(batch);
}

/** The batch's photos still waiting, narrowed to `photoIds` when given. */
async function waitingIn(batchId: string, photoIds?: readonly string[]): Promise<string[]> {
  if (!UUID.test(batchId)) return [];
  const wanted = photoIds?.filter((id) => UUID.test(id));
  const items = await getDb().ingestItem.findMany({
    where: {
      batchId,
      photo: { status: "NEEDS_REVIEW" },
      ...(wanted ? { photoId: { in: wanted } } : {}),
    },
    select: { photoId: true },
  });
  return items.map((item) => item.photoId!);
}

/** Lets the family see photos from a batch: all that are waiting, or the ones named. */
export async function publishPhotos(
  actor: Actor,
  batchId: string,
  photoIds?: readonly string[],
): Promise<number> {
  assertCan(actor, "write");
  const ids = await waitingIn(batchId, photoIds);
  const { count } = await getDb().photo.updateMany({
    where: { id: { in: ids }, status: "NEEDS_REVIEW" },
    data: { status: "PUBLISHED" },
  });
  return count;
}

/** Throws out photos that are still waiting. Published ones are never touched. */
export async function discardPhotos(
  actor: Actor,
  batchId: string,
  photoIds: readonly string[],
): Promise<number> {
  assertCan(actor, "write");
  const ids = await waitingIn(batchId, photoIds);
  for (const id of ids) await deletePhoto(actor, id);
  return ids.length;
}

/** Gives the same date to several waiting photos: "everything in this box is from 1974". */
export async function datePhotos(
  actor: Actor,
  batchId: string,
  photoIds: readonly string[],
  text: string,
): Promise<{ ok: true; count: number } | { ok: false; message: string }> {
  assertCan(actor, "write");
  const date = parseFuzzyDate(text);
  if (date?.year === undefined) {
    return { ok: false, message: 'Include a year, such as "1974", "July 1974" or "around 1974".' };
  }
  const ids = await waitingIn(batchId, photoIds);
  const { count } = await getDb().photo.updateMany({
    where: { id: { in: ids } },
    data: toColumns(date),
  });
  return { ok: true, count };
}
