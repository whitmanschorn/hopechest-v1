/**
 * Reads the JSON files of a Facebook "Download your information" export and
 * finds the photos in them, with what Facebook knows about each: the words of
 * the post, the album, who was tagged, when it was taken or posted.
 *
 * Facebook has changed the layout of its export several times, so this does
 * not depend on file names. It walks every JSON file and takes any entry that
 * points at a picture, picking up album names, post text and tags from the
 * entries around it. Pure: file reading and copying live in cli/facebook.ts.
 */
import type { Sidecar } from "../../src/lib/ingest/sidecar.ts";

export interface ExportPhoto {
  /** Path of the picture inside the export, as Facebook wrote it. */
  uri: string;
  sidecar: Sidecar;
}

/**
 * Facebook writes text as UTF-8 bytes spelled out one character per byte, so
 * "é" arrives as "Ã©". This puts it back. Text that is already right is kept.
 */
export function fixText(text: string): string {
  if (!/[\u0080-ÿ]/.test(text) || /[^\u0000-ÿ]/.test(text)) return text.trim();
  const decoded = Buffer.from(text, "latin1").toString("utf8");
  return (decoded.includes("�") ? text : decoded).trim();
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const fromSeconds = (seconds: unknown): Date | null =>
  typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000) : null;

/** "2014-06-03", for the photo's date. */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** "3 June 2014", for the note to the reviewer. */
const plainDay = (date: Date) =>
  `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

const PICTURE = /\.(jpe?g|png|webp|gif|tiff?)$/i;

/** Titles Facebook gives its own catch-all albums; not worth making albums of. */
const GENERIC_ALBUMS = /^(timeline photos|mobile uploads|profile pictures|cover photos|photos)$/i;

interface Around {
  album?: string;
  text?: string;
  people?: string[];
  posted?: Date;
}

const text = (value: unknown): string => (typeof value === "string" ? fixText(value) : "");

/** When the camera says the picture was taken, if the export kept that. */
function takenAt(media: Record<string, unknown>): Date | null {
  const metadata = media.media_metadata as Record<string, unknown> | undefined;
  const photo = metadata?.photo_metadata as Record<string, unknown> | undefined;
  const exif = Array.isArray(photo?.exif_data) ? photo.exif_data : [];
  for (const entry of exif) {
    const taken = fromSeconds((entry as Record<string, unknown> | null)?.taken_timestamp);
    if (taken) return taken;
  }
  return null;
}

function walk(value: unknown, around: Around, found: ExportPhoto[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, around, found);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  const here: Around = { ...around };

  // An album file: { name, photos: [...] }.
  if (Array.isArray(node.photos) && text(node.name)) here.album = text(node.name);
  // A post: { timestamp, data: [{ post: "words" }], tags: [{ name }], attachments: [...] }.
  if (Array.isArray(node.data)) {
    const words = node.data.map((entry) => text((entry as Record<string, unknown> | null)?.post));
    const post = words.find(Boolean);
    if (post) here.text = post;
  }
  if (Array.isArray(node.tags)) {
    const names = node.tags
      .map((tag) => text(typeof tag === "string" ? tag : (tag as Record<string, unknown>)?.name))
      .filter(Boolean);
    if (names.length > 0) here.people = names;
  }
  here.posted = fromSeconds(node.timestamp) ?? here.posted;

  if (typeof node.uri === "string" && PICTURE.test(node.uri)) {
    const title = text(node.title);
    const album = here.album ?? (title && !GENERIC_ALBUMS.test(title) ? title : undefined);
    const caption = text(node.description) || here.text || "";
    const taken = takenAt(node);
    const posted = fromSeconds(node.creation_timestamp) ?? here.posted;
    found.push({
      uri: node.uri,
      sidecar: {
        ...(caption ? { caption: caption.slice(0, 2000) } : {}),
        // Only the camera's date is the photo's date. The day it was posted may
        // be decades later, so it goes in a note for whoever reviews it.
        ...(taken ? { date: isoDay(taken) } : {}),
        ...(album ? { album } : {}),
        ...(here.people ? { people: here.people } : {}),
        ...(posted ? { note: `Posted on Facebook, ${plainDay(posted)}.` } : {}),
      },
    });
  }
  for (const [key, child] of Object.entries(node)) {
    // Comments are other people's words about the photo, not part of it.
    if (key !== "comments") walk(child, here, found);
  }
}

/** Every photo the export's JSON files mention, once each, with the fullest details found. */
export function collectPhotos(files: readonly unknown[]): ExportPhoto[] {
  const found: ExportPhoto[] = [];
  for (const file of files) walk(file, {}, found);
  const byUri = new Map<string, ExportPhoto>();
  for (const photo of found) {
    const earlier = byUri.get(photo.uri);
    // The same picture is often listed twice (in a post and in an album).
    byUri.set(
      photo.uri,
      earlier ? { uri: photo.uri, sidecar: { ...photo.sidecar, ...earlier.sidecar } } : photo,
    );
  }
  return [...byUri.values()].sort((a, b) => a.uri.localeCompare(b.uri));
}

/** A folder name made from an album's title. */
export function folderName(album: string | undefined): string {
  const name = (album ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return name || "no-album";
}
