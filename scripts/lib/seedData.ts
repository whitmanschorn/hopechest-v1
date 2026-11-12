// The shape of a seed directory (seed/<family>/) and the checks it must pass
// before anything is written. Pure: no file or database access.
import { parseFuzzyDate, type FuzzyDate } from "../../src/lib/fuzzyDate.ts";

export const GENDERS = ["female", "male", "other"] as const;
export const RELATIONSHIP_TYPES = ["parent", "partner"] as const;
export const PARENT_QUALIFIERS = ["biological", "adoptive", "step", "foster", "legal"] as const;
export const PARTNER_QUALIFIERS = ["married", "partnered"] as const;
export const END_REASONS = ["divorce", "separation", "annulment", "death", "other"] as const;
export const EVENT_KINDS = [
  "birth",
  "death",
  "marriage",
  "divorce",
  "move",
  "immigration",
  "military",
  "education",
  "work",
  "other",
] as const;
export const EVENT_ROLES = ["subject", "parent", "child", "officiant", "witness", "other"] as const;

export interface SeedPerson {
  slug: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  birthFamilyName?: string;
  nicknames?: string[];
  alternateNames?: string[];
  gender?: (typeof GENDERS)[number];
  /** Omit when unknown. */
  isLiving?: boolean;
  notes?: string;
  /** File name (without extension) of the document that becomes their wiki page. */
  article?: string;
}

export interface SeedRelationship {
  type: (typeof RELATIONSHIP_TYPES)[number];
  /** For "parent": the parent. */
  from: string;
  /** For "parent": the child. */
  to: string;
  qualifier: (typeof PARENT_QUALIFIERS)[number] | (typeof PARTNER_QUALIFIERS)[number];
  endReason?: (typeof END_REASONS)[number];
  note?: string;
}

export interface SeedPlace {
  slug: string;
  label: string;
  street?: string;
  city?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

/** A date as written in a seed file: "1965-05-04", "1990", "c. 1964", or the long form. */
export type SeedDate =
  string | { value: string; display?: string; deduced?: boolean; clue?: string };

export interface SeedEvent {
  slug: string;
  kind: (typeof EVENT_KINDS)[number];
  title: string;
  description?: string;
  place?: string;
  date?: SeedDate;
  participants: { person: string; role?: (typeof EVENT_ROLES)[number] }[];
  /** Slugs of the documents this event is recorded in. */
  sources?: string[];
}

export const DOCUMENT_KINDS = ["article", "record", "letter", "recipe", "story", "other"] as const;

/**
 * The wiki articles were copied with the tail ends of picture captions left
 * in: `"]]`, or `" in "Good Grief"]]`, at the start of a line, sometimes run
 * straight into the paragraph after, or after the sentence before. This removes each one (everything up to
 * a `]]` that no `[[` on the line opens) and keeps the paragraph.
 */
export function stripCaptionLeftovers(text: string): string {
  return (
    text
      .replace(/^[^[\]\n]{0,120}\]\]/gm, "")
      // The same, where the caption was run into the end of the sentence before it.
      .replace(/ {2,}[^[\]\n.]{0,80}(?:"[^"\n]*"[^[\]\n]{0,10})?\]\] ?/g, " ")
      .replace(/ ?"\]\] ?/g, " ")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
  );
}

export interface SeedDocument {
  /** File name without extension; the stable key. */
  slug: string;
  title: string;
  /** "article" (a wiki page, the default) or a family paper such as "record". */
  kind: (typeof DOCUMENT_KINDS)[number];
  /** Where an article was copied from. Family papers have none. */
  sourceUrl?: string;
  /** The date of the paper itself, e.g. "1965-02-13". */
  date?: string;
  /** File name under files/ of a picture of the original paper. */
  scan?: string;
  license: string;
  retrieved?: string;
  text: string;
}

/** A test account. Its phone must be a fictional 555-01xx number. */
export interface SeedUser {
  phone: string;
  role: "admin" | "contributor" | "viewer";
  /** The person this account belongs to. */
  person?: string;
}

export interface SeedData {
  people: SeedPerson[];
  relationships: SeedRelationship[];
  places: SeedPlace[];
  events: SeedEvent[];
  documents: SeedDocument[];
  users?: SeedUser[];
}

export function resolveDate(date: SeedDate | undefined): FuzzyDate | null {
  if (date === undefined) return null;
  const long = typeof date === "string" ? { value: date } : date;
  const parsed = parseFuzzyDate(long.value);
  if (!parsed) return null;
  return {
    ...parsed,
    ...(long.display ? { display: long.display } : {}),
    ...(long.deduced ? { deduced: true } : {}),
    ...(long.clue ? { clue: long.clue } : {}),
  };
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const value of values) (seen.has(value) ? twice : seen).add(value);
  return [...twice];
}

/** Every problem found, in plain words. An empty list means the seed can be applied. */
export function validateSeed(data: SeedData): string[] {
  const problems: string[] = [];
  const people = new Set(data.people.map((person) => person.slug));
  const places = new Set(data.places.map((place) => place.slug));

  const slugSets: [string, string[]][] = [
    ["person", data.people.map((p) => p.slug)],
    ["place", data.places.map((p) => p.slug)],
    ["event", data.events.map((e) => e.slug)],
    ["document", data.documents.map((d) => d.slug)],
  ];
  for (const [kind, slugs] of slugSets) {
    for (const slug of slugs) {
      if (!SLUG.test(slug)) problems.push(`${kind} slug "${slug}" is not lowercase-with-dashes`);
    }
    for (const slug of duplicates(slugs)) problems.push(`${kind} slug "${slug}" is used twice`);
  }

  for (const person of data.people) {
    if (!person.displayName?.trim()) problems.push(`person "${person.slug}" has no displayName`);
    if (person.article && !data.documents.some((doc) => doc.slug === person.article)) {
      problems.push(`person "${person.slug}": no document "${person.article}" for their article`);
    }
    if (person.gender && !GENDERS.includes(person.gender)) {
      problems.push(`person "${person.slug}" has unknown gender "${person.gender}"`);
    }
  }

  const edges: string[] = [];
  for (const rel of data.relationships) {
    const name = `${rel.type} ${rel.from} -> ${rel.to}`;
    if (!RELATIONSHIP_TYPES.includes(rel.type)) problems.push(`${name}: unknown type`);
    for (const slug of [rel.from, rel.to]) {
      if (!people.has(slug)) problems.push(`${name}: no person "${slug}"`);
    }
    if (rel.from === rel.to) problems.push(`${name}: a person cannot relate to themselves`);
    const allowed: readonly string[] =
      rel.type === "parent" ? PARENT_QUALIFIERS : PARTNER_QUALIFIERS;
    if (!allowed.includes(rel.qualifier)) {
      problems.push(`${name}: qualifier "${rel.qualifier}" does not fit a ${rel.type}`);
    }
    if (rel.endReason && !END_REASONS.includes(rel.endReason)) {
      problems.push(`${name}: unknown endReason "${rel.endReason}"`);
    }
    if (rel.endReason && rel.type !== "partner") {
      problems.push(`${name}: only a partner relationship can end`);
    }
    const pair = rel.type === "partner" ? [rel.from, rel.to].sort().join("+") : name;
    edges.push(`${rel.type}:${pair}:${rel.qualifier}`);
  }
  for (const edge of duplicates(edges)) problems.push(`relationship ${edge} is listed twice`);

  for (const place of data.places) {
    if (!place.label?.trim()) problems.push(`place "${place.slug}" has no label`);
    if ((place.lat === undefined) !== (place.lng === undefined)) {
      problems.push(`place "${place.slug}" needs both lat and lng, or neither`);
    }
    if (place.lat !== undefined && Math.abs(place.lat) > 90) {
      problems.push(`place "${place.slug}" has an impossible latitude`);
    }
    if (place.lng !== undefined && Math.abs(place.lng) > 180) {
      problems.push(`place "${place.slug}" has an impossible longitude`);
    }
  }

  const births = new Map<string, number>();
  const deaths = new Map<string, number>();
  for (const event of data.events) {
    const name = `event "${event.slug}"`;
    if (!EVENT_KINDS.includes(event.kind)) problems.push(`${name}: unknown kind "${event.kind}"`);
    if (!event.title?.trim()) problems.push(`${name}: no title`);
    if (event.place && !places.has(event.place))
      problems.push(`${name}: no place "${event.place}"`);
    if (event.participants.length === 0) problems.push(`${name}: no participants`);
    for (const slug of duplicates(event.participants.map((p) => p.person))) {
      problems.push(`${name}: "${slug}" takes part twice`);
    }
    for (const participant of event.participants) {
      if (!people.has(participant.person)) {
        problems.push(`${name}: no person "${participant.person}"`);
      }
      if (participant.role && !EVENT_ROLES.includes(participant.role)) {
        problems.push(`${name}: unknown role "${participant.role}"`);
      }
    }

    const date = resolveDate(event.date);
    if (event.date !== undefined && date?.year === undefined) {
      problems.push(`${name}: date has no year`);
    }
    if (typeof event.date === "object" && event.date.deduced && !event.date.clue) {
      problems.push(`${name}: a deduced date must say what it rests on (clue)`);
    }

    const subjects = event.participants
      .filter((p) => (p.role ?? "subject") === "subject")
      .map((p) => p.person);
    if (event.kind === "birth" || event.kind === "death") {
      if (subjects.length !== 1) problems.push(`${name}: a ${event.kind} has exactly one subject`);
      const seen = event.kind === "birth" ? births : deaths;
      for (const slug of subjects) {
        if (seen.has(slug)) problems.push(`${name}: "${slug}" already has a ${event.kind}`);
        if (date?.year !== undefined) seen.set(slug, date.year);
      }
    }
    if ((event.kind === "marriage" || event.kind === "divorce") && subjects.length !== 2) {
      problems.push(`${name}: a ${event.kind} has exactly two subjects`);
    }
  }

  for (const [slug, born] of births) {
    const died = deaths.get(slug);
    if (died !== undefined && died < born) problems.push(`"${slug}" dies before being born`);
  }
  for (const rel of data.relationships) {
    if (rel.type !== "parent") continue;
    const [parent, child] = [births.get(rel.from), births.get(rel.to)];
    if (parent !== undefined && child !== undefined && parent >= child) {
      problems.push(`parent "${rel.from}" is not older than child "${rel.to}"`);
    }
  }
  for (const person of data.people) {
    if (person.isLiving && deaths.has(person.slug)) {
      problems.push(`person "${person.slug}" is marked living but has a death event`);
    }
  }

  for (const doc of data.documents) {
    const name = `document "${doc.slug}"`;
    if (!doc.title?.trim()) problems.push(`${name}: no title`);
    if (!doc.text.trim()) problems.push(`${name}: no text`);
    if (!DOCUMENT_KINDS.includes(doc.kind)) problems.push(`${name}: unknown kind "${doc.kind}"`);
    if (doc.kind === "article" && !/^https:\/\//.test(doc.sourceUrl ?? "")) {
      problems.push(`${name}: no source_url`);
    }
    if (doc.scan !== undefined && !/^[a-z0-9-]+\.(jpg|png)$/.test(doc.scan)) {
      problems.push(`${name}: scan must be a .jpg or .png file name`);
    }
    if (doc.date !== undefined && resolveDate(doc.date)?.year === undefined) {
      problems.push(`${name}: date has no year`);
    }
    if (!doc.license?.trim()) problems.push(`${name}: no license`);
  }
  const documents = new Set(data.documents.map((doc) => doc.slug));
  for (const event of data.events) {
    for (const slug of event.sources ?? []) {
      if (!documents.has(slug)) problems.push(`event "${event.slug}": no document "${slug}"`);
    }
    // A date read off a record is not a deduction.
    if (event.sources?.length && typeof event.date === "object" && event.date.deduced) {
      problems.push(`event "${event.slug}": a date with a source cannot also be deduced`);
    }
  }
  const urls = data.documents.flatMap((d) => (d.sourceUrl ? [d.sourceUrl] : []));
  for (const url of duplicates(urls)) {
    problems.push(`two documents share the source ${url}`);
  }

  const owners: string[] = [];
  for (const user of data.users ?? []) {
    // This repository is public: only numbers reserved for fiction may appear.
    if (!/^\+1\d{3}55501\d{2}$/.test(user.phone)) {
      problems.push(`user "${user.phone}": seed accounts must use a fictional 555-01xx number`);
    }
    if (!["admin", "contributor", "viewer"].includes(user.role)) {
      problems.push(`user "${user.phone}": unknown role "${user.role}"`);
    }
    if (user.person) {
      if (!people.has(user.person))
        problems.push(`user "${user.phone}": no person "${user.person}"`);
      owners.push(user.person);
    }
  }
  for (const phone of duplicates((data.users ?? []).map((user) => user.phone))) {
    problems.push(`user "${phone}" is listed twice`);
  }
  for (const slug of duplicates(owners)) problems.push(`two users claim the person "${slug}"`);

  return problems;
}

/**
 * Splits a seed document into its `key: value` header (between `---` lines)
 * and body. Values may be wrapped in double quotes.
 */
export function parseSeedDocument(slug: string, file: string): SeedDocument {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(file);
  const header: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split("\n")) {
    const pair = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (pair) header[pair[1]] = pair[2].replace(/^"(.*)"$/, "$1");
  }
  return {
    slug,
    title: header.title ?? "",
    // The wiki pages say "character" or "concept" here; both are articles.
    kind: (DOCUMENT_KINDS as readonly string[]).includes(header.kind ?? "")
      ? (header.kind as SeedDocument["kind"])
      : "article",
    ...(header.source_url ? { sourceUrl: header.source_url } : {}),
    ...(header.date ? { date: header.date } : {}),
    ...(header.scan ? { scan: header.scan } : {}),
    license: header.license ?? "",
    ...(header.retrieved ? { retrieved: header.retrieved } : {}),
    text: stripCaptionLeftovers(match ? match[2] : file).trim(),
  };
}

export { chunkMarkdown, type Chunk } from "../../src/lib/documents/chunk.ts";
