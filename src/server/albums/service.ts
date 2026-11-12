import { getDb } from "@/lib/db";
import { assertCan, can, type Actor } from "@/server/actor";
import { cardFields, toCard, type PhotoCard } from "@/server/photos/service";

export interface AlbumCard {
  id: string;
  title: string;
  description: string | null;
  count: number;
  /** The chosen cover, else the first photo, else nothing yet. */
  coverUrl: string | null;
}

export interface AlbumDetail extends Omit<AlbumCard, "coverUrl"> {
  coverPhotoId: string | null;
  photos: PhotoCard[];
  canEdit: boolean;
}

export interface AlbumFormInput {
  title: string;
  description: string;
  /** Id of the photo on the album's cover; empty for "the first one". */
  cover: string;
}

export type AlbumErrors = Partial<Record<"title" | "description", string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const published = { status: "PUBLISHED" as const };

export async function listAlbums(actor: Actor): Promise<AlbumCard[]> {
  assertCan(actor, "read");
  const albums = await getDb().album.findMany({
    orderBy: [{ title: "asc" }, { id: "asc" }],
    include: {
      coverPhoto: { select: { thumbUrl: true, status: true } },
      photos: {
        where: { photo: published },
        orderBy: [{ position: "asc" }, { photoId: "asc" }],
        take: 1,
        select: { photo: { select: { thumbUrl: true } } },
      },
      _count: { select: { photos: { where: { photo: published } } } },
    },
  });
  return albums.map((album) => ({
    id: album.id,
    title: album.title,
    description: album.description,
    count: album._count.photos,
    coverUrl:
      (album.coverPhoto?.status === "PUBLISHED" ? album.coverPhoto.thumbUrl : null) ??
      album.photos[0]?.photo.thumbUrl ??
      null,
  }));
}

/** Albums as choices for a form, by title. */
export async function listAlbumOptions(actor: Actor): Promise<{ value: string; label: string }[]> {
  assertCan(actor, "read");
  const albums = await getDb().album.findMany({
    orderBy: [{ title: "asc" }, { id: "asc" }],
    select: { id: true, title: true },
  });
  return albums.map((album) => ({ value: album.id, label: album.title }));
}

export async function getAlbum(actor: Actor, id: string): Promise<AlbumDetail | null> {
  assertCan(actor, "read");
  if (!UUID.test(id)) return null;
  const album = await getDb().album.findUnique({
    where: { id },
    include: {
      photos: {
        where: { photo: published },
        orderBy: [{ position: "asc" }, { photoId: "asc" }],
        select: { photo: { select: cardFields } },
      },
    },
  });
  if (!album) return null;
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    count: album.photos.length,
    coverPhotoId: album.coverPhotoId,
    photos: album.photos.map((entry) => toCard(entry.photo)),
    canEdit: can(actor, "write"),
  };
}

function check(input: AlbumFormInput): { title: string; description: string; errors: AlbumErrors } {
  const title = input.title.trim();
  const description = input.description.trim();
  const errors: AlbumErrors = {};
  if (!title) errors.title = "Give the album a name.";
  else if (title.length > 120) errors.title = "Keep the name under 120 characters.";
  if (description.length > 2000)
    errors.description = "Keep the description under 2,000 characters.";
  return { title, description, errors };
}

export async function createAlbum(
  actor: Actor,
  input: AlbumFormInput,
): Promise<{ ok: true; id: string } | { ok: false; errors: AlbumErrors }> {
  assertCan(actor, "write");
  const { title, description, errors } = check(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const album = await getDb().album.create({
    data: { title, description: description || null },
    select: { id: true },
  });
  return { ok: true, id: album.id };
}

export async function updateAlbum(
  actor: Actor,
  id: string,
  input: AlbumFormInput,
): Promise<{ ok: true } | { ok: false; errors: AlbumErrors }> {
  assertCan(actor, "write");
  const { title, description, errors } = check(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!UUID.test(id)) return { ok: true };
  const db = getDb();
  // Only a photo that is in the album can be on its cover.
  const cover = UUID.test(input.cover)
    ? await db.albumPhoto.findUnique({
        where: { albumId_photoId: { albumId: id, photoId: input.cover } },
        select: { photoId: true },
      })
    : null;
  await db.album.updateMany({
    where: { id },
    data: { title, description: description || null, coverPhotoId: cover?.photoId ?? null },
  });
  return { ok: true };
}

/** Removes the album. Its photos stay in the chest. */
export async function deleteAlbum(actor: Actor, id: string): Promise<void> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return;
  await getDb().album.deleteMany({ where: { id } });
}
