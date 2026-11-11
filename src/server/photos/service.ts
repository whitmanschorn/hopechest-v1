import { getDb } from "@/lib/db";
import { fromColumns, parseFuzzyDate, toColumns, type FuzzyDate } from "@/lib/fuzzyDate";
import {
  derivedKeys,
  fileUrl,
  isOriginalKey,
  keyFromUrl,
  contentTypeForKey,
} from "@/lib/photos/keys";
import { assertCan, can, type Actor } from "@/server/actor";
import { getStorage } from "@/server/storage";
import { processImage } from "./process";

export interface PhotoCard {
  id: string;
  thumbUrl: string;
  width: number;
  height: number;
  caption: string | null;
  date: FuzzyDate | null;
}

export interface PhotoDetail extends PhotoCard {
  displayUrl: string;
  originalUrl: string;
  originalFilename: string | null;
  photographer: string | null;
  place: { slug: string; label: string } | null;
  people: { slug: string; displayName: string }[];
  uploadedBy: string | null;
  uploadedAt: Date;
  /** Whether the signed-in person may edit or delete it. */
  canEdit: boolean;
}

const cardFields = {
  id: true,
  thumbUrl: true,
  width: true,
  height: true,
  caption: true,
  dateYear: true,
  dateMonth: true,
  dateDay: true,
  datePrecision: true,
  dateDisplay: true,
  dateDeduced: true,
  dateClue: true,
} as const;

type CardRow = Parameters<typeof fromColumns>[0] &
  Pick<PhotoCard, "id" | "thumbUrl" | "width" | "height" | "caption">;

const toCard = (row: CardRow): PhotoCard => ({
  id: row.id,
  thumbUrl: row.thumbUrl,
  width: row.width,
  height: row.height,
  caption: row.caption,
  date: fromColumns(row),
});

export const PAGE_SIZE = 60;

/**
 * Published photos, newest upload first. `person` narrows to photos a person
 * is tagged in. `before` is the id of the last photo of the previous page.
 */
export async function listPhotos(
  actor: Actor,
  options: { person?: string; before?: string } = {},
): Promise<{ photos: PhotoCard[]; next: string | null; total: number }> {
  assertCan(actor, "read");
  const db = getDb();
  const where = {
    status: "PUBLISHED" as const,
    ...(options.person ? { people: { some: { person: { slug: options.person } } } } : {}),
  };
  const [rows, total] = await Promise.all([
    db.photo.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(options.before ? { cursor: { id: options.before }, skip: 1 } : {}),
      select: cardFields,
    }),
    db.photo.count({ where }),
  ]);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    photos: page.map(toCard),
    next: rows.length > PAGE_SIZE ? page[page.length - 1].id : null,
    total,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function getPhoto(actor: Actor, id: string): Promise<PhotoDetail | null> {
  assertCan(actor, "read");
  if (!UUID.test(id)) return null;
  const photo = await getDb().photo.findUnique({
    where: { id },
    include: {
      place: { select: { slug: true, label: true } },
      people: {
        include: { person: { select: { slug: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
      uploadedBy: { select: { person: { select: { displayName: true } } } },
    },
  });
  if (!photo) return null;
  return {
    ...toCard(photo),
    displayUrl: photo.displayUrl,
    originalUrl: photo.originalUrl,
    originalFilename: photo.originalFilename,
    photographer: photo.photographer,
    place: photo.place,
    people: photo.people.map((tag) => tag.person),
    uploadedBy: photo.uploadedBy?.person?.displayName ?? null,
    uploadedAt: photo.createdAt,
    canEdit: can(actor, "write"),
  };
}

export type RegisterResult =
  { ok: true; id: string; duplicate: boolean } | { ok: false; message: string };

/**
 * Turns a freshly uploaded original into a photo: checks it is an image,
 * makes the smaller copies, reads the camera date, and records it. The same
 * file uploaded twice gives the photo already in the chest.
 */
export async function registerPhoto(
  actor: Actor,
  input: { key: string; filename?: string },
): Promise<RegisterResult> {
  assertCan(actor, "write");
  if (!isOriginalKey(input.key)) return { ok: false, message: "That upload could not be found." };
  const storage = getStorage();
  const original = await storage.read(input.key);
  if (!original) return { ok: false, message: "That upload could not be found." };

  let image;
  try {
    image = await processImage(original);
  } catch {
    await storage.delete([input.key]);
    return { ok: false, message: "That file is not a picture this chest can read." };
  }

  const db = getDb();
  const existing = await db.photo.findUnique({
    where: { sha256: image.sha256 },
    select: { id: true },
  });
  if (existing) {
    await storage.delete([input.key]);
    return { ok: true, id: existing.id, duplicate: true };
  }

  // The id is made here so the smaller copies can be stored under it first.
  const id = crypto.randomUUID();
  const keys = derivedKeys(id);
  await Promise.all([
    storage.put(keys.display, image.display, "image/jpeg"),
    storage.put(keys.thumb, image.thumb, "image/jpeg"),
  ]);
  try {
    await db.photo.create({
      data: {
        id,
        sha256: image.sha256,
        originalUrl: fileUrl(input.key),
        displayUrl: fileUrl(keys.display),
        thumbUrl: fileUrl(keys.thumb),
        width: image.width,
        height: image.height,
        mimeType: contentTypeForKey(input.key),
        bytes: original.byteLength,
        originalFilename: input.filename?.slice(0, 200) || null,
        uploadedById: actor.kind === "user" ? actor.userId : null,
        exif: image.exif ?? undefined,
        ...toColumns(image.taken),
      },
    });
  } catch (error) {
    await storage.delete([keys.display, keys.thumb]);
    // Two uploads of the same file at once: the other one won.
    const winner = await db.photo.findUnique({
      where: { sha256: image.sha256 },
      select: { id: true },
    });
    if (!winner) throw error;
    await storage.delete([input.key]);
    return { ok: true, id: winner.id, duplicate: true };
  }
  return { ok: true, id, duplicate: false };
}

export interface PhotoFormInput {
  caption: string;
  /** Free text read by parseFuzzyDate. */
  date: string;
  photographer: string;
  /** Slugs of the people in the photo. */
  people: string[];
}

export type PhotoErrors = Partial<Record<"caption" | "date" | "people", string>>;

export async function updatePhoto(
  actor: Actor,
  id: string,
  input: PhotoFormInput,
): Promise<{ ok: true } | { ok: false; errors: PhotoErrors }> {
  assertCan(actor, "write");
  const errors: PhotoErrors = {};
  const caption = input.caption.trim();
  if (caption.length > 2000) errors.caption = "Keep the caption under 2,000 characters.";
  const date = parseFuzzyDate(input.date);
  if (date && date.year === undefined) {
    errors.date = 'Include a year, such as "1967-12-14", "1989" or "around 1964".';
  }

  const db = getDb();
  const slugs = [...new Set(input.people)];
  const people = await db.person.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  if (people.length !== slugs.length) errors.people = "Someone picked is no longer in the chest.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  await db.$transaction(async (tx) => {
    const photo = await tx.photo.findUnique({
      where: { id },
      select: { dateDisplay: true, people: { select: { personId: true } } },
    });
    if (!photo) return;
    await tx.photo.update({
      where: { id },
      data: {
        caption: caption || null,
        photographer: input.photographer.trim().slice(0, 200) || null,
        // An unchanged date keeps its "deduced" flag and clue.
        ...((date?.display ?? null) !== photo.dateDisplay ? toColumns(date) : {}),
      },
    });
    const wanted = new Set(people.map((person) => person.id));
    const had = new Set(photo.people.map((tag) => tag.personId));
    // Only the difference is written, so existing tags keep their face boxes.
    await tx.photoPerson.deleteMany({
      where: {
        photoId: id,
        personId: { in: [...had].filter((personId) => !wanted.has(personId)) },
      },
    });
    await tx.photoPerson.createMany({
      data: [...wanted]
        .filter((personId) => !had.has(personId))
        .map((personId) => ({
          photoId: id,
          personId,
          createdById: actor.kind === "user" ? actor.userId : null,
        })),
    });
  });
  return { ok: true };
}

/** Removes the photo and its stored files. */
export async function deletePhoto(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return;
  const db = getDb();
  const photo = await db.photo.findUnique({
    where: { id },
    select: { originalUrl: true, displayUrl: true, thumbUrl: true },
  });
  if (!photo) return;
  await db.photo.delete({ where: { id } });
  const keys = [photo.originalUrl, photo.displayUrl, photo.thumbUrl]
    .map(keyFromUrl)
    .filter((key): key is string => key !== null);
  // The row is gone; a file left behind is only wasted space, so do not fail on it.
  await getStorage()
    .delete(keys)
    .catch((error) => console.error("Could not delete stored files", keys, error));
}
