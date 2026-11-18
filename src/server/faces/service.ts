import { getDb } from "@/lib/db";
import { faceCrop, overlap } from "@/lib/faces/crop";
import { groupFaces, pickPerson, type Neighbour } from "@/lib/faces/group";
import {
  FACE_MODEL,
  fromVectorText,
  GROUP_DISTANCE,
  MATCH_DISTANCE,
  parseEmbedding,
  toVectorText,
} from "@/lib/faces/model";
import type { Box } from "@/lib/photos/box";
import { assertCan, type Actor } from "@/server/actor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuids = (values: readonly string[]) => [...new Set(values)].filter((id) => UUID.test(id));

/** Not looked over yet, or looked over with a model since replaced. */
const UNSCANNED = { OR: [{ facesModel: null }, { facesModel: { not: FACE_MODEL } }] };

// ── scanning: the command-line tool finds faces, the chest keeps them ──

export interface ScanTarget {
  id: string;
  /** The viewing copy; big enough to find faces in, far smaller than the original. */
  imageUrl: string;
}

/** Photos nobody has looked over for faces yet, newest first, and how many there are. */
export async function listUnscanned(
  actor: Actor,
  options: { limit?: number } = {},
): Promise<{ model: string; photos: ScanTarget[]; remaining: number }> {
  assertCan(actor, "ingest");
  const db = getDb();
  const take = Math.min(Math.max(Math.trunc(options.limit ?? 50) || 50, 1), 200);
  const [rows, remaining] = await Promise.all([
    db.photo.findMany({
      where: UNSCANNED,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: { id: true, displayUrl: true },
    }),
    db.photo.count({ where: UNSCANNED }),
  ]);
  return {
    model: FACE_MODEL,
    photos: rows.map((row) => ({ id: row.id, imageUrl: row.displayUrl })),
    remaining,
  };
}

/** A face box from a program: inside the picture and not a speck. */
function readBox(value: unknown): Box | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  const numbers = [x, y, w, h];
  if (!numbers.every((n): n is number => typeof n === "number" && Number.isFinite(n))) return null;
  const [bx, by, bw, bh] = numbers as number[];
  if (bx < 0 || by < 0 || bw < 0.5 || bh < 0.5 || bx + bw > 100.01 || by + bh > 100.01) return null;
  return { x: bx, y: by, w: bw, h: bh };
}

const MAX_FACES = 60;
const boxOf = (row: { boxX: number; boxY: number; boxW: number; boxH: number }): Box => ({
  x: row.boxX,
  y: row.boxY,
  w: row.boxW,
  h: row.boxH,
});

export type RecordResult =
  { ok: true; faces: number; linked: number } | { ok: false; status: 404 | 422; message: string };

/**
 * Stores what a scan found in one photo, replacing what an earlier scan found.
 * Faces a person has already named, ruled on or set aside are kept. A tag
 * someone drew by hand around a face names that face.
 */
export async function recordFaces(
  actor: Actor,
  photoId: string,
  input: { model: string; faces: unknown },
): Promise<RecordResult> {
  assertCan(actor, "ingest");
  if (input.model !== FACE_MODEL) {
    return {
      ok: false,
      status: 422,
      message: `This chest takes faces from the model "${FACE_MODEL}". Update the command-line tool.`,
    };
  }
  if (!Array.isArray(input.faces) || input.faces.length > MAX_FACES) {
    return { ok: false, status: 422, message: `Send \`faces\` as a list of at most ${MAX_FACES}.` };
  }
  const found: { box: Box; score: number | null; embedding: number[] }[] = [];
  for (const entry of input.faces as Record<string, unknown>[]) {
    const box = readBox(entry?.box);
    const embedding = parseEmbedding(entry?.embedding);
    if (!box || !embedding) {
      return {
        ok: false,
        status: 422,
        message:
          "Each face needs `box` ({ x, y, w, h } in percentages of the picture) and `embedding` (128 numbers).",
      };
    }
    const score =
      typeof entry.score === "number" && Number.isFinite(entry.score) ? entry.score : null;
    found.push({ box, score: score === null ? null : Math.min(Math.max(score, 0), 1), embedding });
  }
  if (!UUID.test(photoId)) return { ok: false, status: 404, message: "No photo with that id." };

  const db = getDb();
  const result = await db.$transaction(async (tx) => {
    const photo = await tx.photo.findUnique({
      where: { id: photoId },
      select: {
        faces: true,
        people: { where: { faceId: null, boxX: { not: null } } },
      },
    });
    if (!photo) return null;

    // What a person has decided about a face outlives a new scan.
    const decided = photo.faces.filter(
      (face) => face.personId || face.ignored || face.rejectedPersonIds.length > 0,
    );
    await tx.face.deleteMany({
      where: { photoId, id: { notIn: decided.map((face) => face.id) } },
    });

    const vectors: { id: string; text: string }[] = [];
    const fresh: { id: string; box: Box }[] = [];
    const taken = new Set<string>();
    for (const face of found) {
      const same = decided.find(
        (kept) => !taken.has(kept.id) && overlap(boxOf(kept), face.box) >= 0.4,
      );
      const id = same?.id ?? crypto.randomUUID();
      if (same) {
        taken.add(same.id);
        await tx.face.update({
          where: { id },
          data: { score: face.score, model: input.model },
        });
      } else {
        fresh.push({ id, box: face.box });
      }
      vectors.push({ id, text: toVectorText(face.embedding) });
    }
    await tx.face.createMany({
      data: fresh.map(({ id, box }) => {
        const face = found[vectors.findIndex((vector) => vector.id === id)];
        return {
          id,
          photoId,
          boxX: box.x,
          boxY: box.y,
          boxW: box.w,
          boxH: box.h,
          score: face.score,
          model: input.model,
        };
      }),
    });
    if (vectors.length > 0) {
      await tx.$executeRaw`
        UPDATE faces AS f SET embedding = v.embedding::vector
        FROM unnest(${vectors.map((v) => v.id)}::uuid[], ${vectors.map((v) => v.text)}::text[])
          AS v(id, embedding)
        WHERE f.id = v.id`;
    }

    // A box someone drew around a face says whose face it is.
    let linked = 0;
    const free = [...fresh];
    for (const tag of photo.people) {
      const drawn = { x: tag.boxX!, y: tag.boxY!, w: tag.boxW!, h: tag.boxH! };
      const best = free
        .map((face) => ({ face, shared: overlap(face.box, drawn) }))
        .sort((a, b) => b.shared - a.shared)[0];
      if (!best || best.shared < 0.3) continue;
      free.splice(free.indexOf(best.face), 1);
      await tx.face.update({
        where: { id: best.face.id },
        data: { personId: tag.personId, confirmedAt: new Date() },
      });
      await tx.photoPerson.update({ where: { id: tag.id }, data: { faceId: best.face.id } });
      linked += 1;
    }

    await tx.photo.update({
      where: { id: photoId },
      data: { facesModel: input.model, facesScannedAt: new Date() },
    });
    return { faces: found.length, linked };
  });
  return result
    ? { ok: true, ...result }
    : { ok: false, status: 404, message: "No photo with that id." };
}

// ── "Who is this?": unnamed faces, grouped, each group with a guess ──

export interface FaceTile {
  id: string;
  photoId: string;
  imageUrl: string;
  /** Where to put the whole photo inside a square window so only the face shows. */
  crop: { width: string; left: string; top: string };
}

export interface FaceGroup {
  /** The id of its first face; stable while the group is on screen. */
  key: string;
  /** How many faces are in the group; `faces` holds the clearest of them. */
  size: number;
  faces: FaceTile[];
  suggestion: {
    slug: string;
    displayName: string;
    /** "looks": like faces already named. "tagged": that person is tagged in these photos. */
    reason: "looks" | "tagged";
  } | null;
}

export interface FaceQueue {
  groups: FaceGroup[];
  /** Unnamed faces in all, and the groups they fall into. */
  waiting: number;
  groupCount: number;
  page: number;
  pages: number;
  /** How far scanning has got, so an empty queue can say why it is empty. */
  scanned: number;
  photos: number;
}

/** More unnamed faces than this and only the newest are grouped. */
const MAX_GROUPED = 2000;
const GROUPS_PER_PAGE = 12;
const FACES_SHOWN = 18;
const PROBES = 3;

interface QueueRow {
  id: string;
  photo_id: string;
  box_x: number;
  box_y: number;
  box_w: number;
  box_h: number;
  score: number | null;
  embedding: string;
  rejected_person_ids: string[];
  thumb_url: string;
  display_url: string;
  width: number;
  height: number;
}

/**
 * Faces nobody has named, sorted into groups that are probably one person
 * each, biggest group first. With `photoId`, only the faces in that photo.
 */
export async function getFaceQueue(
  actor: Actor,
  options: { photoId?: string; page?: number } = {},
): Promise<FaceQueue> {
  assertCan(actor, "write");
  const db = getDb();
  const onePhoto = options.photoId && UUID.test(options.photoId) ? options.photoId : null;
  // Everywhere but on one photo's own page, only photos the family can see.
  const rows = onePhoto
    ? await db.$queryRaw<QueueRow[]>`
        SELECT f.id, f.photo_id, f.box_x, f.box_y, f.box_w, f.box_h, f.score,
               f.embedding::text AS embedding,
               COALESCE(f.rejected_person_ids, '{}') AS rejected_person_ids,
               p.thumb_url, p.display_url, p.width, p.height
        FROM faces f JOIN photos p ON p.id = f.photo_id
        WHERE f.person_id IS NULL AND NOT f.ignored AND f.embedding IS NOT NULL
          AND f.model = ${FACE_MODEL} AND f.photo_id = ${onePhoto}::uuid
        ORDER BY f.created_at DESC, f.id`
    : await db.$queryRaw<QueueRow[]>`
        SELECT f.id, f.photo_id, f.box_x, f.box_y, f.box_w, f.box_h, f.score,
               f.embedding::text AS embedding,
               COALESCE(f.rejected_person_ids, '{}') AS rejected_person_ids,
               p.thumb_url, p.display_url, p.width, p.height
        FROM faces f JOIN photos p ON p.id = f.photo_id
        WHERE f.person_id IS NULL AND NOT f.ignored AND f.embedding IS NOT NULL
          AND f.model = ${FACE_MODEL} AND p.status = 'PUBLISHED'
        ORDER BY f.created_at DESC, f.id
        LIMIT ${MAX_GROUPED}`;
  const [waiting, scanned, photos] = await Promise.all([
    onePhoto ? rows.length : countWaitingFaces(actor),
    db.photo.count({ where: { facesModel: FACE_MODEL } }),
    db.photo.count(),
  ]);

  const all = groupFaces(
    rows.map((row) => fromVectorText(row.embedding)),
    GROUP_DISTANCE,
  ).map((members) =>
    // The clearest faces lead, and are the ones compared with named faces.
    members.map((at) => rows[at]).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
  );
  const pages = Math.max(1, Math.ceil(all.length / GROUPS_PER_PAGE));
  const page = Math.min(Math.max(Math.trunc(options.page ?? 1) || 1, 1), pages);
  const shown = all.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE);

  const [near, tagged] = await Promise.all([
    nearestNamed(shown.flatMap((group) => group.slice(0, PROBES).map((row) => row.id))),
    looseTags([...new Set(rows.map((row) => row.photo_id))]),
  ]);
  const byTag = tagGuesses(all, tagged);
  const guesses = shown.map((group) => {
    const looks = pickPerson(
      group.slice(0, PROBES).flatMap((row) => near.get(row.id) ?? []),
      MATCH_DISTANCE,
      new Set(group.flatMap((row) => row.rejected_person_ids)),
    );
    if (looks) return { personId: looks.personId, reason: "looks" as const };
    const tag = byTag.get(group[0].id);
    return tag ? { personId: tag, reason: "tagged" as const } : null;
  });
  const people = await db.person.findMany({
    where: { id: { in: guesses.flatMap((guess) => (guess ? [guess.personId] : [])) } },
    select: { id: true, slug: true, displayName: true },
  });

  return {
    groups: shown.map((group, index) => {
      const guess = guesses[index];
      const person = guess && people.find((entry) => entry.id === guess.personId);
      return {
        key: group[0].id,
        size: group.length,
        faces: group.slice(0, FACES_SHOWN).map((row) => {
          const box = { x: row.box_x, y: row.box_y, w: row.box_w, h: row.box_h };
          return {
            id: row.id,
            photoId: row.photo_id,
            // The small copy is enough unless the face is a small part of the picture.
            imageUrl: Math.max(box.w, box.h) >= 25 ? row.thumb_url : row.display_url,
            crop: faceCrop(box, row.width, row.height),
          };
        }),
        suggestion:
          guess && person
            ? { slug: person.slug, displayName: person.displayName, reason: guess.reason }
            : null,
      };
    }),
    waiting,
    groupCount: all.length,
    page,
    pages,
    scanned,
    photos,
  };
}

/**
 * Guesses from tags alone, for when no named face is near: someone tagged in
 * most of a group's photos, with no place marked, is probably the face those
 * photos share. A person is offered for one group only, the one that fits
 * them best, since every other face in those photos is tagged the same way.
 * Returns the person for each group that gets one, by the group's first face.
 */
function tagGuesses(groups: QueueRow[][], tagged: Map<string, string[]>): Map<string, string> {
  const facesIn = new Map<string, number>();
  for (const row of groups.flat()) facesIn.set(row.photo_id, (facesIn.get(row.photo_id) ?? 0) + 1);

  const best = new Map<string, { key: string; count: number }>();
  for (const group of groups) {
    const ruledOut = new Set(group.flatMap((row) => row.rejected_person_ids));
    const photoIds = [...new Set(group.map((row) => row.photo_id))];
    const counts = new Map<string, number>();
    for (const photoId of photoIds) {
      for (const personId of tagged.get(photoId) ?? []) {
        if (!ruledOut.has(personId)) counts.set(personId, (counts.get(personId) ?? 0) + 1);
      }
    }
    for (const [personId, count] of counts) {
      // In most of the group's photos; and one photo is only enough when the
      // face is alone in it.
      if (count * 2 <= photoIds.length) continue;
      if (count === 1 && facesIn.get(photoIds[0]) !== 1) continue;
      // Groups come biggest first, and the first to reach a count keeps it.
      if (count > (best.get(personId)?.count ?? 0)) best.set(personId, { key: group[0].id, count });
    }
  }
  const guesses = new Map<string, string>();
  const contested = new Set<string>();
  for (const [personId, leader] of best) {
    // Two people fitting one group equally well is no guess at all.
    if (guesses.has(leader.key)) contested.add(leader.key);
    guesses.set(leader.key, personId);
  }
  for (const key of contested) guesses.delete(key);
  return guesses;
}

/** For each face, the named faces nearest to it. One query, using the vector index. */
async function nearestNamed(faceIds: string[]): Promise<Map<string, Neighbour[]>> {
  const found = new Map<string, Neighbour[]>();
  if (faceIds.length === 0) return found;
  const rows = await getDb().$queryRaw<{ face_id: string; person_id: string; d: number }[]>`
    SELECT q.id AS face_id, n.person_id, n.d
    FROM faces q
    CROSS JOIN LATERAL (
      SELECT c.person_id, c.embedding <-> q.embedding AS d
      FROM faces c
      WHERE c.person_id IS NOT NULL AND c.embedding IS NOT NULL
      ORDER BY c.embedding <-> q.embedding
      LIMIT 5
    ) n
    WHERE q.id = ANY(${faceIds}::uuid[])`;
  for (const row of rows) {
    found.set(row.face_id, [
      ...(found.get(row.face_id) ?? []),
      { personId: row.person_id, distance: Number(row.d) },
    ]);
  }
  return found;
}

/** Per photo, the people tagged in it whose face has not been pointed out. */
async function looseTags(photoIds: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  if (photoIds.length === 0) return found;
  const tags = await getDb().photoPerson.findMany({
    where: { photoId: { in: photoIds }, faceId: null, boxX: null },
    select: { photoId: true, personId: true },
  });
  for (const tag of tags) found.set(tag.photoId, [...(found.get(tag.photoId) ?? []), tag.personId]);
  return found;
}

/** Unnamed faces in photos the family can see. */
export async function countWaitingFaces(actor: Actor): Promise<number> {
  assertCan(actor, "write");
  return getDb().face.count({
    where: {
      personId: null,
      ignored: false,
      model: FACE_MODEL,
      photo: { status: "PUBLISHED" },
    },
  });
}

/** Unnamed faces in one photo, for the link on its page. */
export async function countPhotoFaces(actor: Actor, photoId: string): Promise<number> {
  assertCan(actor, "write");
  if (!UUID.test(photoId)) return 0;
  return getDb().face.count({
    where: { photoId, personId: null, ignored: false, model: FACE_MODEL },
  });
}

// ── deciding ──

export type DecideResult = { ok: true; count: number } | { ok: false; message: string };

const MAX_AT_ONCE = 200;
const tooMany: DecideResult = {
  ok: false,
  message: `Decide at most ${MAX_AT_ONCE} faces at a time.`,
};

/**
 * Says whose faces these are. Each becomes a tag on its photo, with the face's
 * place in the picture, and from then on helps recognise that person.
 */
export async function nameFaces(
  actor: Actor,
  input: { faceIds: readonly string[]; person: string },
): Promise<DecideResult> {
  assertCan(actor, "write");
  const ids = uuids(input.faceIds);
  if (ids.length === 0) return { ok: false, message: "Pick at least one face." };
  if (ids.length > MAX_AT_ONCE) return tooMany;
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug: input.person },
    select: { id: true },
  });
  if (!person) return { ok: false, message: "Nobody in the chest has that address." };

  const count = await db.$transaction(async (tx) => {
    const faces = await tx.face.findMany({
      where: { id: { in: ids }, personId: null },
      orderBy: { score: "desc" },
    });
    for (const face of faces) {
      await tx.face.update({
        where: { id: face.id },
        data: { personId: person.id, confirmedAt: new Date(), ignored: false },
      });
      const tag = await tx.photoPerson.findUnique({
        where: { photoId_personId: { photoId: face.photoId, personId: person.id } },
      });
      if (!tag) {
        await tx.photoPerson.create({
          data: {
            photoId: face.photoId,
            personId: person.id,
            boxX: face.boxX,
            boxY: face.boxY,
            boxW: face.boxW,
            boxH: face.boxH,
            faceId: face.id,
            createdById: actor.kind === "user" ? actor.userId : null,
          },
        });
      } else if (!tag.faceId) {
        // Already tagged, perhaps with a box drawn by hand: keep that box.
        await tx.photoPerson.update({
          where: { id: tag.id },
          data: {
            faceId: face.id,
            ...(tag.boxX === null
              ? { boxX: face.boxX, boxY: face.boxY, boxW: face.boxW, boxH: face.boxH }
              : {}),
          },
        });
      }
      // Tagged and tied to another face already (a mirror, a portrait on the
      // wall): the face is named, and the tag stays where it was.
    }
    return faces.length;
  });
  return { ok: true, count };
}

/** "Not them": the faces stay unnamed and that person is not suggested for them again. */
export async function rejectFaces(
  actor: Actor,
  input: { faceIds: readonly string[]; person: string },
): Promise<DecideResult> {
  assertCan(actor, "write");
  const ids = uuids(input.faceIds);
  if (ids.length === 0) return { ok: false, message: "Pick at least one face." };
  if (ids.length > MAX_AT_ONCE) return tooMany;
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug: input.person },
    select: { id: true },
  });
  if (!person) return { ok: false, message: "Nobody in the chest has that address." };
  const count = await db.$executeRaw`
    UPDATE faces SET rejected_person_ids = array_append(rejected_person_ids, ${person.id}::uuid)
    WHERE id = ANY(${ids}::uuid[]) AND person_id IS NULL
      AND NOT (${person.id}::uuid = ANY(COALESCE(rejected_person_ids, '{}')))`;
  return { ok: true, count };
}

/** "Nobody to name": a stranger, a statue, not a face at all. They leave the queue. */
export async function ignoreFaces(
  actor: Actor,
  input: { faceIds: readonly string[] },
): Promise<DecideResult> {
  assertCan(actor, "write");
  const ids = uuids(input.faceIds);
  if (ids.length === 0) return { ok: false, message: "Pick at least one face." };
  if (ids.length > MAX_AT_ONCE) return tooMany;
  const { count } = await getDb().face.updateMany({
    where: { id: { in: ids }, personId: null },
    data: { ignored: true },
  });
  return { ok: true, count };
}
