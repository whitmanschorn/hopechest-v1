import sharp from "sharp";
import { getDb } from "@/lib/db";
import { AVATAR_PIXELS, type StoredCrop } from "@/lib/people/avatarCrop";
import { boxFromColumns, type Box } from "@/lib/photos/box";
import { avatarKey, fileUrl, keyFromUrl } from "@/lib/photos/keys";
import { assertCan, can, ForbiddenError, type Actor } from "@/server/actor";
import { recordChanges } from "@/server/changelog";
import { getStorage } from "@/server/storage";

export interface PictureChoice {
  id: string;
  thumbUrl: string;
  displayUrl: string;
  caption: string | null;
  /** Where this person is in the photo, if marked: the crop starts there. */
  box: Box | null;
}

export interface PictureSubject {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  isYou: boolean;
  /** Photos in the chest this person is tagged in, newest first. */
  photos: PictureChoice[];
}

/** The cropped picture is small; anything larger is not one this app made. */
const MAX_PICTURE_BYTES = 900 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** People who can edit may set anyone's picture; everyone may set their own. */
function mayChange(actor: Actor, personId: string): boolean {
  return can(actor, "write") || (actor.kind === "user" && actor.personId === personId);
}

/** Who the picture is for and what there is to choose from; null if not theirs to change. */
export async function getPictureSubject(
  actor: Actor,
  slug: string,
): Promise<PictureSubject | null> {
  assertCan(actor, "read");
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug },
    select: { id: true, slug: true, displayName: true, avatarUrl: true },
  });
  if (!person || !mayChange(actor, person.id)) return null;
  const photos = await db.photo.findMany({
    where: { status: "PUBLISHED", people: { some: { personId: person.id } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 60,
    select: {
      id: true,
      thumbUrl: true,
      displayUrl: true,
      caption: true,
      people: { where: { personId: person.id } },
    },
  });
  return {
    slug: person.slug,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    isYou: actor.kind === "user" && actor.personId === person.id,
    photos: photos.map(({ people, ...photo }) => ({
      ...photo,
      box: people[0] ? boxFromColumns(people[0]) : null,
    })),
  };
}

export async function canChangePicture(actor: Actor, slug: string): Promise<boolean> {
  assertCan(actor, "read");
  if (can(actor, "write")) return true;
  if (actor.kind !== "user" || !actor.personId) return false;
  const person = await getDb().person.findUnique({ where: { slug }, select: { id: true } });
  return person?.id === actor.personId;
}

async function removeStored(url: string | null): Promise<void> {
  const key = url ? keyFromUrl(url) : null;
  if (!key?.startsWith("avatars/")) return;
  // A file left behind is only wasted space, so do not fail on it.
  await getStorage()
    .delete([key])
    .catch((error) => console.error("Could not delete old profile picture", key, error));
}

export type PictureResult = { ok: true } | { ok: false; message: string };

/**
 * Saves a profile picture. `image` is the square the browser cut out; it is
 * re-encoded here, so whatever was sent ends up a plain 512px JPEG. `photoId`
 * and `crop` remember which chest photo it came from, if it came from one.
 */
export async function setProfilePicture(
  actor: Actor,
  slug: string,
  input: { image: Buffer; photoId: string | null; crop: StoredCrop | null },
): Promise<PictureResult> {
  assertCan(actor, "read");
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug },
    select: { id: true, avatarUrl: true },
  });
  if (!person) return { ok: false, message: "That person is no longer in the chest." };
  if (!mayChange(actor, person.id)) throw new ForbiddenError("write");
  if (input.image.byteLength === 0 || input.image.byteLength > MAX_PICTURE_BYTES) {
    return { ok: false, message: "That picture could not be read. Try another." };
  }

  let picture: Buffer;
  try {
    picture = await sharp(input.image, { failOn: "error", limitInputPixels: 16_000_000 })
      .rotate()
      .resize({ width: AVATAR_PIXELS, height: AVATAR_PIXELS, fit: "cover" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
  } catch {
    return { ok: false, message: "That picture could not be read. Try another." };
  }

  const photo =
    input.photoId && UUID.test(input.photoId)
      ? await db.photo.findUnique({ where: { id: input.photoId }, select: { id: true } })
      : null;
  const key = avatarKey(person.id, crypto.randomUUID());
  await getStorage().put(key, picture, "image/jpeg");
  await db.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: person.id },
      data: {
        avatarUrl: fileUrl(key),
        avatarPhotoId: photo?.id ?? null,
        avatarCrop: photo && input.crop ? { ...input.crop } : undefined,
      },
    });
    await recordChanges(tx, actor, "person", person.id, [
      {
        field: "avatar",
        before: person.avatarUrl ? "Had a picture" : null,
        after: photo ? "New picture, from a photo in the chest" : "New picture",
      },
    ]);
  });
  await removeStored(person.avatarUrl);
  return { ok: true };
}

export async function removeProfilePicture(actor: Actor, slug: string): Promise<void> {
  assertCan(actor, "read");
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug },
    select: { id: true, avatarUrl: true },
  });
  if (!person?.avatarUrl) return;
  if (!mayChange(actor, person.id)) throw new ForbiddenError("write");
  await db.$transaction(async (tx) => {
    await tx.person.update({
      where: { id: person.id },
      data: { avatarUrl: null, avatarPhotoId: null },
    });
    await recordChanges(tx, actor, "person", person.id, [
      { field: "avatar", before: "Had a picture", after: null },
    ]);
  });
  await removeStored(person.avatarUrl);
}
