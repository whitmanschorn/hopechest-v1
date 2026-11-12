/**
 * What can come with a file being ingested: a "sidecar" of details someone
 * already knows (a caption written on a slide mount, a date, who is in it).
 * Pure and free of imports, so the command-line tool reads sidecars with the
 * same rules the server applies.
 */

export interface Sidecar {
  caption?: string;
  /** As a person would write it: "1974-07-04", "1974", "around 1964". */
  date?: string;
  photographer?: string;
  /** Names or slugs of the people in the picture. */
  people?: string[];
  /** Title of an album to put it in; made if there is none by that name. */
  album?: string;
  /** Where it was copied from, such as a Facebook post. */
  sourceUrl?: string;
  /** Something for the reviewer to know, such as "Posted on Facebook, 3 June 2014". */
  note?: string;
  /** For a document: its title (the file's name if not given). */
  title?: string;
  /** For a document: letter, record, recipe, story, article or other. */
  kind?: string;
  /**
   * "document" files a picture as a page of a document rather than a photo.
   * PDFs and text files are always documents.
   */
  type?: string;
}

const TEXT_FIELDS = [
  "caption",
  "date",
  "photographer",
  "album",
  "sourceUrl",
  "note",
  "title",
  "kind",
  "type",
] as const;

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";

/** A clean sidecar from whatever JSON came in. Unknown fields are dropped. */
export function parseSidecar(value: unknown): Sidecar {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const given = value as Record<string, unknown>;
  const sidecar: Sidecar = {};
  for (const field of TEXT_FIELDS) {
    const found = text(given[field]).slice(0, 2000);
    if (found) sidecar[field] = found;
  }
  const people = Array.isArray(given.people)
    ? given.people.map(text)
    : text(given.people).split(/[,;]/);
  const names = [...new Set(people.map((name) => name.trim()).filter(Boolean))].slice(0, 50);
  if (names.length > 0) sidecar.people = names;
  return sidecar;
}

/** Details given for the whole run, under the ones a file brings itself. */
export function withDefaults(sidecar: Sidecar, defaults: Sidecar): Sidecar {
  return { ...defaults, ...sidecar };
}

export interface Nameable {
  id: string;
  slug: string;
  displayName: string;
  givenName?: string | null;
  familyName?: string | null;
  nicknames?: readonly string[];
  alternateNames?: readonly string[];
}

const fold = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Every way a person may be written, folded for comparison. */
function namesOf(person: Nameable): Set<string> {
  const full = [person.givenName, person.familyName].filter(Boolean).join(" ");
  return new Set(
    [
      person.slug,
      person.displayName,
      full,
      ...(person.nicknames ?? []),
      ...(person.alternateNames ?? []),
    ]
      .map(fold)
      .filter(Boolean),
  );
}

export type NameMatch =
  { found: true; person: Nameable } | { found: false; reason: "nobody" | "several" };

/**
 * Who a written name means. Only an exact match on one of a person's names
 * counts, and only if it points at one person: a wrong tag is worse than none.
 */
export function matchPerson(name: string, people: readonly Nameable[]): NameMatch {
  const wanted = fold(name);
  if (!wanted) return { found: false, reason: "nobody" };
  const bySlug = people.find((person) => person.slug === name.trim());
  if (bySlug) return { found: true, person: bySlug };
  const matches = people.filter((person) => namesOf(person).has(wanted));
  if (matches.length === 1) return { found: true, person: matches[0] };
  return { found: false, reason: matches.length === 0 ? "nobody" : "several" };
}

/** The kinds of picture file the chest accepts, by file extension. */
export const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  gif: "image/gif",
};

/** Files that are documents whatever their sidecar says. */
export const DOCUMENT_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
};

export interface FolderFile {
  /** Path inside the folder, with "/" between parts. */
  path: string;
  contentType: string;
  /** What it is by its file type; a picture's sidecar can still make it a document. */
  kind: "photo" | "document";
  /** Path of the JSON file of details beside it, if there is one. */
  sidecar: string | null;
}

/**
 * Sorts a folder's file list into pictures and documents (each with its
 * sidecar, if any) and everything else. A sidecar is "<picture>.json" or the picture's name
 * with ".json" in place of its extension. Hidden files are ignored.
 */
export function planFolder(paths: readonly string[]): { files: FolderFile[]; skipped: string[] } {
  const visible = paths.filter((path) => !path.split("/").some((part) => part.startsWith(".")));
  const all = new Set(visible);
  const used = new Set<string>();
  const files: FolderFile[] = [];
  const rest: string[] = [];
  for (const path of [...visible].sort()) {
    const dot = path.lastIndexOf(".");
    const extension = dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
    const contentType = IMAGE_EXTENSIONS[extension] ?? DOCUMENT_EXTENSIONS[extension];
    if (!contentType) {
      rest.push(path);
      continue;
    }
    const sidecar =
      [`${path}.json`, `${path.slice(0, dot)}.json`].find((candidate) => all.has(candidate)) ??
      null;
    if (sidecar) used.add(sidecar);
    files.push({
      path,
      contentType,
      kind: IMAGE_EXTENSIONS[extension] ? "photo" : "document",
      sidecar,
    });
  }
  return { files, skipped: rest.filter((path) => !used.has(path)) };
}
