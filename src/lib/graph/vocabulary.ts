/**
 * The vocabulary of the family graph: the kinds of node, and the kinds of
 * fact ("predicates") that can be stated about them. Pure.
 *
 * A fact reads subject, predicate, object: "George Sr. · founded · the Bluth
 * Company". The object is another node, or a plain value (text, a date, a
 * number). Families can add predicates of their own (stored in the database);
 * these built-in ones cover what family histories usually hold.
 *
 * A few predicates are "core": parentage, partnerships, birth and death,
 * taking part in an event. Those live in strict tables of their own, because
 * working out who "grandma" is depends on them, and appear in the graph as
 * facts that are changed through the person's or event's own form.
 */

export const NODE_KINDS = [
  "person",
  "place",
  "event",
  "topic",
  "organization",
  "group",
  "thing",
  "animal",
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Kinds a wiki topic page can be given. The rest have tables of their own. */
export const PAGE_KINDS = ["topic", "organization", "group", "thing", "animal"] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const KIND_LABELS: Record<NodeKind, string> = {
  person: "Person",
  place: "Place",
  event: "Event",
  topic: "Topic",
  organization: "Organization",
  group: "Group",
  thing: "Thing",
  animal: "Animal",
};

export const KIND_HINTS: Record<PageKind, string> = {
  topic: "Anything else: a tradition, a story, a saying",
  organization: "A company, school, church, regiment or club",
  group: "A household, a branch of the family, a band, a team",
  thing: "An object: an heirloom, a car, a boat, a recipe book",
  animal: "A pet or working animal",
};

export const isNodeKind = (value: string): value is NodeKind =>
  (NODE_KINDS as readonly string[]).includes(value);
export const isPageKind = (value: string): value is PageKind =>
  (PAGE_KINDS as readonly string[]).includes(value);

export type ValueType = "entity" | "text" | "date" | "number";

export interface PredicateDef {
  key: string;
  /** Read from subject to object: "worked at". */
  label: string;
  /** Read from object to subject: "employed". Absent for plain values. */
  inverse?: string;
  description?: string;
  value: ValueType;
  /** Kinds of node it can be said about; empty for any. */
  subjects: readonly NodeKind[];
  /** Kinds of node it can point at; empty for any. Only for "entity". */
  objects: readonly NodeKind[];
  /** Reads the same both ways: "friend of". */
  symmetric?: boolean;
  /** Usually true for a stretch of time, so the form offers from and until. */
  spans?: boolean;
  /** Held in the strict tables and shown here read-only. */
  core?: boolean;
  /** Added by this family rather than built in. */
  custom?: boolean;
  group: "family" | "life" | "work" | "places" | "things" | "other";
}

const ORGS = ["organization", "group"] as const;
const OWNERS = ["person", "organization", "group"] as const;

export const BUILTIN_PREDICATES: readonly PredicateDef[] = [
  // ── core: held in the strict tables ──
  {
    key: "parent_of",
    label: "parent of",
    inverse: "child of",
    value: "entity",
    subjects: ["person"],
    objects: ["person"],
    core: true,
    group: "family",
  },
  {
    key: "partner_of",
    label: "partner of",
    value: "entity",
    subjects: ["person"],
    objects: ["person"],
    symmetric: true,
    spans: true,
    core: true,
    group: "family",
  },
  {
    key: "born",
    label: "born",
    value: "date",
    subjects: ["person"],
    objects: [],
    core: true,
    group: "life",
  },
  {
    key: "died",
    label: "died",
    value: "date",
    subjects: ["person"],
    objects: [],
    core: true,
    group: "life",
  },
  {
    key: "took_part_in",
    label: "took part in",
    inverse: "included",
    value: "entity",
    subjects: ["person"],
    objects: ["event"],
    core: true,
    group: "life",
  },
  {
    key: "happened_at",
    label: "happened at",
    inverse: "was the scene of",
    value: "entity",
    subjects: ["event"],
    objects: ["place"],
    core: true,
    group: "places",
  },

  // ── family and friends ──
  {
    key: "godparent_of",
    label: "godparent of",
    inverse: "godchild of",
    value: "entity",
    subjects: ["person"],
    objects: ["person"],
    group: "family",
  },
  {
    key: "raised",
    label: "raised",
    inverse: "raised by",
    description: "Brought someone up without being their parent on record",
    value: "entity",
    subjects: ["person"],
    objects: ["person"],
    spans: true,
    group: "family",
  },
  {
    key: "named_after",
    label: "named after",
    inverse: "namesake of",
    value: "entity",
    subjects: [],
    objects: [],
    group: "family",
  },
  {
    key: "friend_of",
    label: "friend of",
    value: "entity",
    subjects: ["person"],
    objects: ["person"],
    symmetric: true,
    spans: true,
    group: "family",
  },
  {
    key: "neighbor_of",
    label: "neighbor of",
    value: "entity",
    subjects: ["person", "group"],
    objects: ["person", "group"],
    symmetric: true,
    spans: true,
    group: "family",
  },

  // ── a life ──
  {
    key: "born_at",
    label: "born at",
    inverse: "birthplace of",
    value: "entity",
    subjects: ["person", "animal"],
    objects: ["place"],
    group: "life",
  },
  {
    key: "died_at",
    label: "died at",
    inverse: "place of death of",
    value: "entity",
    subjects: ["person", "animal"],
    objects: ["place"],
    group: "life",
  },
  {
    key: "buried_at",
    label: "buried at",
    inverse: "resting place of",
    value: "entity",
    subjects: ["person", "animal"],
    objects: ["place"],
    group: "life",
  },
  {
    key: "cause_of_death",
    label: "cause of death",
    value: "text",
    subjects: ["person", "animal"],
    objects: [],
    group: "life",
  },
  {
    key: "religion",
    label: "religion",
    value: "text",
    subjects: ["person", "group"],
    objects: [],
    spans: true,
    group: "life",
  },
  {
    key: "nationality",
    label: "nationality",
    value: "text",
    subjects: ["person"],
    objects: [],
    spans: true,
    group: "life",
  },
  { key: "known_for", label: "known for", value: "text", subjects: [], objects: [], group: "life" },
  {
    key: "also_known_as",
    label: "also known as",
    value: "text",
    subjects: [],
    objects: [],
    group: "life",
  },

  // ── work, school, service ──
  {
    key: "occupation",
    label: "occupation",
    value: "text",
    subjects: ["person"],
    objects: [],
    spans: true,
    group: "work",
  },
  {
    key: "worked_at",
    label: "worked at",
    inverse: "employed",
    value: "entity",
    subjects: ["person"],
    objects: ORGS,
    spans: true,
    group: "work",
  },
  {
    key: "founded",
    label: "founded",
    inverse: "founded by",
    value: "entity",
    subjects: OWNERS,
    objects: ["organization", "group", "place"],
    group: "work",
  },
  {
    key: "studied_at",
    label: "studied at",
    inverse: "taught",
    value: "entity",
    subjects: ["person"],
    objects: ORGS,
    spans: true,
    group: "work",
  },
  {
    key: "served_in",
    label: "served in",
    inverse: "had in its ranks",
    description: "Military or other service",
    value: "entity",
    subjects: ["person"],
    objects: ORGS,
    spans: true,
    group: "work",
  },
  {
    key: "member_of",
    label: "member of",
    inverse: "had as a member",
    value: "entity",
    subjects: ["person", "animal"],
    objects: ORGS,
    spans: true,
    group: "work",
  },

  // ── places ──
  {
    key: "lived_at",
    label: "lived at",
    inverse: "home of",
    value: "entity",
    subjects: ["person", "group", "animal"],
    objects: ["place"],
    spans: true,
    group: "places",
  },
  {
    key: "located_in",
    label: "located in",
    inverse: "contains",
    value: "entity",
    subjects: ["place", "organization", "thing"],
    objects: ["place"],
    spans: true,
    group: "places",
  },

  // ── things, animals, organizations ──
  {
    key: "owned",
    label: "owned",
    inverse: "owned by",
    value: "entity",
    subjects: OWNERS,
    objects: ["thing", "place", "animal", "organization"],
    spans: true,
    group: "things",
  },
  {
    key: "made",
    label: "made",
    inverse: "made by",
    value: "entity",
    subjects: OWNERS,
    objects: ["thing"],
    group: "things",
  },
  {
    key: "kept_by",
    label: "now kept by",
    inverse: "keeps",
    description: "Who has it today",
    value: "entity",
    subjects: ["thing"],
    objects: OWNERS,
    group: "things",
  },
  {
    key: "part_of",
    label: "part of",
    inverse: "includes",
    value: "entity",
    subjects: ["organization", "group", "thing", "topic"],
    objects: ["organization", "group", "thing", "topic"],
    spans: true,
    group: "things",
  },
  {
    key: "began",
    label: "began",
    description: "When it was founded, built, made or started",
    value: "date",
    subjects: ["organization", "group", "thing", "place", "topic", "animal"],
    objects: [],
    group: "things",
  },
  {
    key: "ended",
    label: "ended",
    description: "When it closed, was lost, sold or stopped",
    value: "date",
    subjects: ["organization", "group", "thing", "place", "topic", "animal"],
    objects: [],
    group: "things",
  },
  {
    key: "about",
    label: "is about",
    inverse: "is the subject of",
    description: "A tradition, story or thing that concerns someone or something",
    value: "entity",
    subjects: ["topic", "thing", "event"],
    objects: [],
    group: "other",
  },
];

export const GROUP_LABELS: Record<PredicateDef["group"], string> = {
  family: "Family and friends",
  life: "Life",
  work: "Work, school and service",
  places: "Places",
  things: "Things and organizations",
  other: "Other",
};

/** The built-in vocabulary with a family's own predicates added. A custom one cannot replace a built-in. */
export function vocabulary(custom: readonly PredicateDef[] = []): PredicateDef[] {
  const builtin = new Set(BUILTIN_PREDICATES.map((def) => def.key));
  return [...BUILTIN_PREDICATES, ...custom.filter((def) => !builtin.has(def.key))];
}

const fits = (kinds: readonly NodeKind[], kind: NodeKind) =>
  kinds.length === 0 || kinds.includes(kind);

/** The facts that can be added about a node of this kind (never the core ones). */
export function predicatesFor(kind: NodeKind, defs: readonly PredicateDef[]): PredicateDef[] {
  return defs.filter((def) => !def.core && fits(def.subjects, kind));
}

/** Why a fact cannot be stated, or null if it can. */
export function checkFact(
  def: PredicateDef | undefined,
  subject: NodeKind,
  object: NodeKind | null,
): string | null {
  if (!def) return "That is not a kind of fact this chest knows.";
  if (def.core) return `“${def.label}” is recorded on the person or event itself, not here.`;
  if (!fits(def.subjects, subject)) {
    return `“${def.label}” cannot be said about a ${KIND_LABELS[subject].toLowerCase()}.`;
  }
  if (def.value !== "entity") return object ? `“${def.label}” takes a value, not a link.` : null;
  if (!object) return `“${def.label}” needs someone or something to point at.`;
  if (!fits(def.objects, object)) {
    return `“${def.label}” cannot point at a ${KIND_LABELS[object].toLowerCase()}.`;
  }
  return null;
}

/** How a fact reads from one end: "worked at" from the subject, "employed" from the object. */
export function readLabel(def: PredicateDef, from: "subject" | "object"): string {
  if (from === "subject" || def.symmetric) return def.label;
  return def.inverse ?? `${def.label} (of)`;
}

/** A key for a family's own predicate, from its label: "Taught piano to" becomes "taught_piano_to". */
export function predicateKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

/** A node's address split into its namespace and slug: "person:lucille". */
export function parseKey(
  key: string,
): { space: "person" | "place" | "event" | "page"; slug: string } | null {
  const match = /^(person|place|event|page):([A-Za-z0-9-]{1,120})$/.exec(key.trim());
  return match
    ? { space: match[1] as "person" | "place" | "event" | "page", slug: match[2] }
    : null;
}

/** The page a node is shown on. */
export function nodeHref(key: string, eventId?: string | null): string | null {
  const parsed = parseKey(key);
  if (!parsed) return null;
  if (parsed.space === "person") return `/people/${parsed.slug}`;
  if (parsed.space === "place") return `/places/${parsed.slug}`;
  if (parsed.space === "event") return eventId ? `/events/${eventId}` : null;
  return `/wiki/${parsed.slug}`;
}
