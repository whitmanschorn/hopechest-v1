import { getDb } from "@/lib/db";
import { describe, parseFuzzyDate, toColumns } from "@/lib/fuzzyDate";
import {
  checkFact,
  isPageKind,
  nodeHref,
  parseKey,
  predicateKey,
  readLabel,
  vocabulary,
  type NodeKind,
  type PredicateDef,
} from "@/lib/graph/vocabulary";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertCan, can, type Actor } from "@/server/actor";
import { getPerson } from "@/server/people/service";

/**
 * The family graph. Every person, place, event and wiki topic page is a node
 * (`entities`). Facts about them are statements: a predicate from the
 * vocabulary pointing at another node or carrying a value, with optional
 * dates, a note, a source and a rank. Parentage, partnerships, birth, death
 * and taking part in events stay in their own strict tables and are read into
 * the graph here, so the whole family can be walked as one thing.
 */

export interface NodeRef {
  /** "person:lucille", "page:cornballer". */
  key: string;
  kind: NodeKind;
  name: string;
  /** Its page on the site. */
  href: string | null;
}

export interface Fact {
  /** Null for a core fact, which is changed on the person or event itself. */
  id: string | null;
  predicate: string;
  /** The predicate read from this node's side: "worked at" or "employed". */
  label: string;
  /** "out": this node is the subject. "in": something else says it of this node. */
  direction: "out" | "in";
  other: NodeRef | null;
  /** A value, ready to show. */
  value: string | null;
  from: string | null;
  until: string | null;
  note: string | null;
  rank: "preferred" | "normal" | "deprecated";
  source: { citation: string; href: string | null } | null;
  quote: string | null;
  core: boolean;
  group: PredicateDef["group"];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EntityRow = { id: string; key: string; kind: string; name: string; eventId: string | null };
const entityFields = { id: true, key: true, kind: true, name: true, eventId: true } as const;

const toRef = (row: EntityRow): NodeRef => ({
  key: row.key,
  kind: row.kind.toLowerCase() as NodeKind,
  name: row.name,
  href: nodeHref(row.key, row.eventId),
});

/** A date as a person wrote it, tidied for showing ("c. 1974" becomes "around 1974"). */
function showDate(text: string | null): string | null {
  if (!text) return null;
  const parsed = parseFuzzyDate(text);
  return parsed ? describe(parsed) : text;
}

async function customPredicates(): Promise<PredicateDef[]> {
  const rows = await getDb().predicate.findMany({ orderBy: { label: "asc" } });
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    inverse: row.inverseLabel ?? undefined,
    description: row.description ?? undefined,
    value: row.valueType.toLowerCase() as PredicateDef["value"],
    subjects: row.subjectKinds.map((kind) => kind.toLowerCase() as NodeKind),
    objects: row.objectKinds.map((kind) => kind.toLowerCase() as NodeKind),
    symmetric: row.symmetric,
    spans: true,
    custom: true,
    group: "other",
  }));
}

/** Every kind of fact this chest knows: the built-in ones and the family's own. */
export async function listPredicates(actor: Actor): Promise<PredicateDef[]> {
  assertCan(actor, "read");
  return vocabulary(await customPredicates());
}

export type PredicateErrors = Partial<Record<"label" | "inverse" | "value" | "kinds", string>>;

/** Adds a kind of fact to the vocabulary. For admins: it shapes what everyone can record. */
export async function createPredicate(
  actor: Actor,
  input: {
    label: string;
    inverse?: string;
    description?: string;
    value: string;
    subjects?: string[];
    objects?: string[];
    symmetric?: boolean;
  },
): Promise<{ ok: true; key: string } | { ok: false; errors: PredicateErrors }> {
  assertCan(actor, "admin");
  const errors: PredicateErrors = {};
  const label = input.label.trim().toLowerCase();
  const key = predicateKey(label);
  const all = vocabulary(await customPredicates());
  if (!key) errors.label = "Say how it reads, such as “taught piano to”.";
  else if (label.length > 60) errors.label = "Keep it under 60 characters.";
  else if (all.some((def) => def.key === key || def.label === label)) {
    errors.label = "There is already a kind of fact with that name.";
  }
  const value = input.value.trim().toLowerCase();
  if (!["entity", "text", "date", "number"].includes(value)) {
    errors.value = "Choose what it points at: a person or thing, words, a date or a number.";
  }
  const inverse = input.inverse?.trim().toLowerCase() || null;
  if (value === "entity" && !input.symmetric && !inverse) {
    errors.inverse = "Say how it reads the other way round, such as “learned piano from”.";
  }
  const kinds = (list?: string[]) => [
    ...new Set((list ?? []).map((kind) => kind.trim().toUpperCase()).filter(Boolean)),
  ];
  const subjects = kinds(input.subjects);
  const objects = value === "entity" ? kinds(input.objects) : [];
  const KINDS = ["PERSON", "PLACE", "EVENT", "TOPIC", "ORGANIZATION", "GROUP", "THING", "ANIMAL"];
  if ([...subjects, ...objects].some((kind) => !KINDS.includes(kind))) {
    errors.kinds = "That is not a kind of thing.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  await getDb().predicate.create({
    data: {
      key,
      label,
      inverseLabel: value === "entity" && !input.symmetric ? inverse : null,
      description: input.description?.trim().slice(0, 300) || null,
      valueType: value.toUpperCase() as "ENTITY" | "TEXT" | "DATE" | "NUMBER",
      subjectKinds: subjects as never,
      objectKinds: objects as never,
      symmetric: value === "entity" && Boolean(input.symmetric),
      createdById: actor.kind === "user" ? actor.userId : null,
    },
  });
  return { ok: true, key };
}

export async function getNode(actor: Actor, key: string): Promise<NodeRef | null> {
  assertCan(actor, "read");
  if (!parseKey(key)) return null;
  const row = await getDb().entity.findUnique({ where: { key }, select: entityFields });
  return row ? toRef(row) : null;
}

/** The key of an event's node. (Events made on the website have no slug of their own.) */
export async function eventNodeKey(actor: Actor, eventId: string): Promise<string | null> {
  assertCan(actor, "read");
  if (!UUID.test(eventId)) return null;
  const row = await getDb().entity.findUnique({ where: { eventId }, select: { key: true } });
  return row?.key ?? null;
}

/** Nodes whose name contains the words, for pickers and for programs finding what to point at. */
export async function searchNodes(
  actor: Actor,
  options: { q?: string; kinds?: string[]; limit?: number } = {},
): Promise<NodeRef[]> {
  assertCan(actor, "read");
  const q = options.q?.trim().slice(0, 100) ?? "";
  const kinds = (options.kinds ?? []).map((kind) => kind.toUpperCase());
  const rows = await getDb().entity.findMany({
    where: {
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      ...(kinds.length > 0 ? { kind: { in: kinds as never } } : {}),
    },
    orderBy: [{ name: "asc" }, { key: "asc" }],
    take: Math.min(options.limit ?? 20, 100),
    select: entityFields,
  });
  return rows.map(toRef);
}

/** Gives a wiki topic page its kind: a company, a house, a pet, an object. */
export async function setNodeKind(actor: Actor, key: string, kind: string): Promise<boolean> {
  assertCan(actor, "write");
  const wanted = kind.trim().toLowerCase();
  if (parseKey(key)?.space !== "page" || !isPageKind(wanted)) return false;
  const { count } = await getDb().entity.updateMany({
    where: { key },
    data: { kind: wanted.toUpperCase() as never },
  });
  return count > 0;
}

/**
 * Makes a node for something that has no page yet (a company someone worked
 * at, a boat someone owned), as an empty wiki topic page of the given kind.
 * If a page of that name exists, that one is used.
 */
export async function createPageNode(
  actor: Actor,
  input: { name: string; kind: string },
): Promise<{ ok: true; node: NodeRef } | { ok: false; message: string }> {
  assertCan(actor, "write");
  const name = input.name.trim();
  const kind = input.kind.trim().toLowerCase();
  if (!name || name.length > 120)
    return { ok: false, message: "Give it a name, under 120 characters." };
  if (!isPageKind(kind)) return { ok: false, message: "Choose what kind of thing it is." };
  const db = getDb();
  const existing = await db.article.findFirst({
    where: { personId: null, title: { equals: name, mode: "insensitive" } },
    select: { entity: { select: entityFields } },
  });
  if (existing?.entity) return { ok: true, node: toRef(existing.entity) };
  const [articles, people] = await Promise.all([
    db.article.findMany({ select: { slug: true } }),
    db.person.findMany({ select: { slug: true } }),
  ]);
  const taken = new Set([...articles, ...people].map((row) => row.slug).concat(["new"]));
  const slug = uniqueSlug(slugify(name), taken, "page");
  const author =
    actor.kind === "user" ? { authorUserId: actor.userId } : { authorApiKeyId: actor.apiKeyId };
  await db.article.create({
    data: {
      slug,
      title: name,
      body: "",
      revisions: { create: { title: name, body: "", summary: "Started the page", ...author } },
    },
  });
  // The trigger has made its node; give it its kind.
  const node = await db.entity.update({
    where: { key: `page:${slug}` },
    data: { kind: kind.toUpperCase() as never },
    select: entityFields,
  });
  return { ok: true, node: toRef(node) };
}

const statementInclude = {
  subject: { select: entityFields },
  object: { select: entityFields },
  source: { select: { citation: true, documentId: true, url: true } },
} as const;

const RANK_ORDER = { PREFERRED: 0, NORMAL: 1, DEPRECATED: 2 } as const;

/**
 * Everything the graph holds about a node: facts stated about it, facts
 * stated elsewhere that point at it, and the core facts from the strict
 * tables, all read from this node's side and in date order.
 */
export async function getFacts(
  actor: Actor,
  key: string,
): Promise<{ node: NodeRef; facts: Fact[]; canEdit: boolean } | null> {
  assertCan(actor, "read");
  if (!parseKey(key)) return null;
  const db = getDb();
  const node = await db.entity.findUnique({
    where: { key },
    select: { ...entityFields, personId: true, placeId: true },
  });
  if (!node) return null;
  const defs = new Map(vocabulary(await customPredicates()).map((def) => [def.key, def]));
  const facts: (Fact & { sort: number })[] = [];

  const statements = await db.statement.findMany({
    where: { OR: [{ subjectId: node.id }, { objectId: node.id }] },
    include: statementInclude,
  });
  for (const row of statements) {
    const def = defs.get(row.predicate);
    if (!def) continue;
    const outgoing = row.subjectId === node.id;
    const value =
      row.valueText ??
      showDate(row.valueDate) ??
      (row.valueNumber !== null ? String(row.valueNumber) : null);
    facts.push({
      id: row.id,
      predicate: def.key,
      label: readLabel(def, outgoing ? "subject" : "object"),
      direction: outgoing ? "out" : "in",
      other: outgoing ? (row.object ? toRef(row.object) : null) : toRef(row.subject),
      value: outgoing ? value : null,
      from: showDate(row.fromDate),
      until: showDate(row.untilDate),
      note: row.note,
      rank: row.rank.toLowerCase() as Fact["rank"],
      source: row.source
        ? {
            citation: row.source.citation,
            href: row.source.documentId
              ? `/documents/${row.source.documentId}`
              : row.source.url?.startsWith("/")
                ? row.source.url
                : null,
          }
        : null,
      quote: row.quote,
      core: false,
      group: def.group,
      sort: RANK_ORDER[row.rank] * 1e9 + (row.sortKey ?? 99_999_999),
    });
  }

  const core = (
    predicate: string,
    side: "subject" | "object",
    fields: Partial<Fact> & { sort?: number },
  ) => {
    const def = defs.get(predicate)!;
    const { sort, ...rest } = fields;
    facts.push({
      id: null,
      predicate,
      label: readLabel(def, side),
      direction: side === "subject" ? "out" : "in",
      other: null,
      value: null,
      from: null,
      until: null,
      note: null,
      rank: "normal",
      source: null,
      quote: null,
      core: true,
      group: def.group,
      ...rest,
      sort: 1e9 + (sort ?? 99_999_999),
    });
  };
  const nodeOf = async (where: { personId?: string; placeId?: string; eventId?: string }) => {
    const row = await db.entity.findFirst({ where, select: entityFields });
    return row ? toRef(row) : null;
  };

  if (node.personId) {
    const slug = parseKey(node.key)!.slug;
    const person = await getPerson(actor, slug);
    if (person) {
      const { born, died } = person.values;
      if (born)
        core("born", "subject", { value: describe(born), note: born.clue ?? null, sort: 0 });
      if (died) core("died", "subject", { value: describe(died), sort: 99_999_998 });
      const about = (relative: { qualifier: string; ended: string | null; note: string | null }) =>
        [
          ["biological", "married", ""].includes(relative.qualifier) ? null : relative.qualifier,
          relative.ended,
          relative.note,
        ]
          .filter(Boolean)
          .join("; ") || null;
      const groups = [
        ["parent_of", "object", person.parents],
        ["parent_of", "subject", person.children],
        ["partner_of", "subject", person.partners],
      ] as const;
      for (const [predicate, side, relatives] of groups) {
        for (const relative of relatives) {
          const other = await nodeOf({ personId: relative.id });
          if (other) core(predicate, side, { other, note: about(relative) });
        }
      }
      for (const event of person.events) {
        const other = await nodeOf({ eventId: event.id });
        if (!other) continue;
        core("took_part_in", "subject", {
          other,
          from: event.date ? describe(event.date) : null,
          sort: event.date ? (toColumns(event.date).dateSortKey ?? undefined) : undefined,
        });
      }
    }
  }
  if (node.eventId) {
    const event = await db.event.findUnique({
      where: { id: node.eventId },
      include: { participants: true },
    });
    for (const part of event?.participants ?? []) {
      const other = await nodeOf({ personId: part.personId });
      if (other) {
        core("took_part_in", "object", {
          other,
          note: part.role === "SUBJECT" ? null : part.role.toLowerCase(),
        });
      }
    }
    if (event?.placeId) {
      const other = await nodeOf({ placeId: event.placeId });
      if (other) core("happened_at", "subject", { other });
    }
  }
  if (node.placeId) {
    const events = await db.event.findMany({
      where: { placeId: node.placeId },
      select: { id: true, dateSortKey: true, dateDisplay: true },
    });
    for (const event of events) {
      const other = await nodeOf({ eventId: event.id });
      if (other) {
        core("happened_at", "object", {
          other,
          from: event.dateDisplay,
          sort: event.dateSortKey ?? undefined,
        });
      }
    }
  }

  facts.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  return {
    node: toRef(node),
    facts: facts.map((fact) => {
      const { sort, ...rest } = fact;
      void sort;
      return rest;
    }),
    canEdit: can(actor, "write"),
  };
}

export interface FactInput {
  /** Key of the node the fact is about. */
  subject: string;
  predicate: string;
  /** Key of the node it points at, for a link. */
  object?: string;
  /** The value, for words, a date or a number. */
  value?: string;
  from?: string;
  until?: string;
  note?: string;
  rank?: string;
  /** Id of the document it was read from. */
  document?: string;
  /** A page of the chest it was read from, instead of a document. */
  page?: { url: string; citation: string };
  quote?: string;
}

export type FactErrors = Partial<
  Record<
    "subject" | "predicate" | "object" | "value" | "from" | "until" | "note" | "rank" | "document",
    string
  >
>;

const RANKS = ["preferred", "normal", "deprecated"] as const;
const dated = (text: string) => parseFuzzyDate(text)?.year !== undefined;
const YEAR_HINT = 'Include a year, such as "1974", "June 1974" or "around 1974".';

/** States a fact. The predicate must suit both ends; dates must be readable. */
export async function addFact(
  actor: Actor,
  input: FactInput,
): Promise<{ ok: true; id: string } | { ok: false; errors: FactErrors }> {
  assertCan(actor, "write");
  const errors: FactErrors = {};
  const db = getDb();
  const defs = vocabulary(await customPredicates());
  const def = defs.find((entry) => entry.key === input.predicate.trim());
  const subject = parseKey(input.subject)
    ? await db.entity.findUnique({ where: { key: input.subject.trim() }, select: entityFields })
    : null;
  if (!subject) errors.subject = "There is nothing in the chest with that address.";

  const objectKey = input.object?.trim();
  const object =
    objectKey && parseKey(objectKey)
      ? await db.entity.findUnique({ where: { key: objectKey }, select: entityFields })
      : null;
  if (objectKey && !object) errors.object = "There is nothing in the chest with that address.";
  if (subject && !errors.object) {
    const problem = checkFact(
      def,
      subject.kind.toLowerCase() as NodeKind,
      object ? (object.kind.toLowerCase() as NodeKind) : null,
    );
    if (problem)
      errors[def && def.value === "entity" && !def.core ? "object" : "predicate"] = problem;
    if (object && object.id === subject.id)
      errors.object = "A fact cannot point at its own subject.";
  }

  const raw = input.value?.trim() ?? "";
  let valueText: string | null = null;
  let valueDate: string | null = null;
  let valueNumber: number | null = null;
  if (def && def.value !== "entity" && !errors.predicate) {
    if (!raw) errors.value = "Give the value.";
    else if (def.value === "text") {
      if (raw.length > 300) errors.value = "Keep it under 300 characters.";
      else valueText = raw;
    } else if (def.value === "date") {
      if (!dated(raw)) errors.value = YEAR_HINT;
      else valueDate = raw;
    } else {
      valueNumber = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(valueNumber)) errors.value = "That is not a number.";
    }
  }
  const from = input.from?.trim() || null;
  const until = input.until?.trim() || null;
  if (from && !dated(from)) errors.from = YEAR_HINT;
  if (until && !dated(until)) errors.until = YEAR_HINT;
  const note = input.note?.trim() || null;
  if (note && note.length > 300) errors.note = "Keep the note under 300 characters.";
  const rank = (input.rank?.trim().toLowerCase() || "normal") as (typeof RANKS)[number];
  if (!RANKS.includes(rank)) errors.rank = "One of: preferred, normal, deprecated.";

  let sourceId: string | null = null;
  if (input.document) {
    const doc = UUID.test(input.document)
      ? await db.document.findUnique({
          where: { id: input.document },
          select: { id: true, title: true, sources: { select: { id: true }, take: 1 } },
        })
      : null;
    if (!doc) errors.document = "There is no such document.";
    else {
      sourceId =
        doc.sources[0]?.id ??
        (
          await db.source.create({
            data: { kind: "DOCUMENT", documentId: doc.id, citation: doc.title },
            select: { id: true },
          })
        ).id;
    }
  }
  if (Object.keys(errors).length > 0 || !subject || !def) return { ok: false, errors };
  if (!sourceId && input.page) {
    const found = await db.source.findFirst({
      where: { kind: "TESTIMONY", url: input.page.url },
      select: { id: true },
    });
    sourceId =
      found?.id ??
      (
        await db.source.create({
          data: { kind: "TESTIMONY", url: input.page.url, citation: input.page.citation },
          select: { id: true },
        })
      ).id;
  }

  const sortFrom = parseFuzzyDate(from ?? valueDate ?? "");
  const row = await db.statement.create({
    data: {
      subjectId: subject.id,
      predicate: def.key,
      objectId: object?.id ?? null,
      valueText,
      valueDate,
      valueNumber,
      fromDate: from,
      untilDate: until,
      sortKey: toColumns(sortFrom).dateSortKey,
      note,
      rank: rank.toUpperCase() as "PREFERRED" | "NORMAL" | "DEPRECATED",
      sourceId,
      quote: input.quote?.trim().slice(0, 1000) || null,
      ...(actor.kind === "user"
        ? { createdByUserId: actor.userId }
        : { createdByApiKeyId: actor.apiKeyId }),
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** Changes a fact's dates, note or rank. To change what it says, remove it and state it anew. */
export async function updateFact(
  actor: Actor,
  id: string,
  input: { from?: string; until?: string; note?: string; rank?: string },
): Promise<{ ok: true } | { ok: false; errors: FactErrors; status?: 404 }> {
  assertCan(actor, "write");
  const db = getDb();
  const row = UUID.test(id) ? await db.statement.findUnique({ where: { id } }) : null;
  if (!row) return { ok: false, errors: { subject: "There is no such fact." }, status: 404 };
  const errors: FactErrors = {};
  const pick = (given: string | undefined, current: string | null) =>
    given === undefined ? current : given.trim() || null;
  const from = pick(input.from, row.fromDate);
  const until = pick(input.until, row.untilDate);
  const note = pick(input.note, row.note);
  if (from && !dated(from)) errors.from = YEAR_HINT;
  if (until && !dated(until)) errors.until = YEAR_HINT;
  if (note && note.length > 300) errors.note = "Keep the note under 300 characters.";
  const rank = input.rank?.trim().toLowerCase() || row.rank.toLowerCase();
  if (!(RANKS as readonly string[]).includes(rank))
    errors.rank = "One of: preferred, normal, deprecated.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  await db.statement.update({
    where: { id },
    data: {
      fromDate: from,
      untilDate: until,
      note,
      rank: rank.toUpperCase() as "PREFERRED" | "NORMAL" | "DEPRECATED",
      sortKey: toColumns(parseFuzzyDate(from ?? row.valueDate ?? "")).dateSortKey,
    },
  });
  return { ok: true };
}

export async function deleteFact(actor: Actor, id: string): Promise<boolean> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return false;
  const { count } = await getDb().statement.deleteMany({ where: { id } });
  return count > 0;
}

export interface GraphEdge {
  from: string;
  to: string;
  predicate: string;
  /** Read from `from` to `to`. */
  label: string;
  /** Read from `to` to `from`. */
  inverse: string;
  core: boolean;
}

/** The whole graph in memory: fine for a family, which is thousands of facts, not millions. */
async function loadGraph(): Promise<{ nodes: Map<string, NodeRef>; edges: GraphEdge[] }> {
  const db = getDb();
  const [entities, relationships, participants, events, statements, custom] = await Promise.all([
    db.entity.findMany({
      select: { ...entityFields, personId: true, placeId: true },
    }),
    db.relationship.findMany({ select: { type: true, fromPersonId: true, toPersonId: true } }),
    db.eventParticipant.findMany({ select: { eventId: true, personId: true } }),
    db.event.findMany({ where: { placeId: { not: null } }, select: { id: true, placeId: true } }),
    db.statement.findMany({
      where: { objectId: { not: null }, rank: { not: "DEPRECATED" } },
      select: { subjectId: true, objectId: true, predicate: true },
    }),
    customPredicates(),
  ]);
  const defs = new Map(vocabulary(custom).map((def) => [def.key, def]));
  const nodes = new Map<string, NodeRef>();
  const byId = new Map<string, string>();
  const byPerson = new Map<string, string>();
  const byPlace = new Map<string, string>();
  const byEvent = new Map<string, string>();
  for (const row of entities) {
    nodes.set(row.key, toRef(row));
    byId.set(row.id, row.key);
    if (row.personId) byPerson.set(row.personId, row.key);
    if (row.placeId) byPlace.set(row.placeId, row.key);
    if (row.eventId) byEvent.set(row.eventId, row.key);
  }
  const edges: GraphEdge[] = [];
  const add = (
    from: string | undefined,
    to: string | undefined,
    predicate: string,
    core: boolean,
  ) => {
    const def = defs.get(predicate);
    if (!from || !to || !def) return;
    edges.push({
      from,
      to,
      predicate,
      label: readLabel(def, "subject"),
      inverse: readLabel(def, "object"),
      core,
    });
  };
  for (const rel of relationships) {
    add(
      byPerson.get(rel.fromPersonId),
      byPerson.get(rel.toPersonId),
      rel.type === "PARENT" ? "parent_of" : "partner_of",
      true,
    );
  }
  for (const part of participants) {
    add(byPerson.get(part.personId), byEvent.get(part.eventId), "took_part_in", true);
  }
  for (const event of events)
    add(byEvent.get(event.id), byPlace.get(event.placeId!), "happened_at", true);
  for (const row of statements)
    add(byId.get(row.subjectId), byId.get(row.objectId!), row.predicate, false);
  return { nodes, edges };
}

export interface Neighbourhood {
  center: NodeRef;
  nodes: NodeRef[];
  edges: GraphEdge[];
  /** True when there was more than could be shown. */
  truncated: boolean;
}

/**
 * A node and what is within `depth` steps of it (1 or 2). Events are left
 * out unless asked for: nearly everyone took part in some, and they would
 * crowd out everything else.
 */
export async function getNeighbourhood(
  actor: Actor,
  key: string,
  options: { depth?: number; events?: boolean; limit?: number } = {},
): Promise<Neighbourhood | null> {
  assertCan(actor, "read");
  const { nodes, edges } = await loadGraph();
  const center = nodes.get(key);
  if (!center) return null;
  const depth = Math.min(Math.max(options.depth ?? 1, 1), 2);
  const limit = Math.min(options.limit ?? 60, 200);
  const usable = edges.filter(
    (edge) =>
      options.events ||
      center.kind === "event" ||
      (nodes.get(edge.from)!.kind !== "event" && nodes.get(edge.to)!.kind !== "event"),
  );
  const seen = new Set([key]);
  let frontier = [key];
  let truncated = false;
  for (let step = 0; step < depth; step++) {
    const next: string[] = [];
    for (const edge of usable) {
      for (const [a, b] of [
        [edge.from, edge.to],
        [edge.to, edge.from],
      ]) {
        if (!frontier.includes(a) || seen.has(b)) continue;
        if (seen.size >= limit) {
          truncated = true;
          continue;
        }
        seen.add(b);
        next.push(b);
      }
    }
    frontier = next;
  }
  return {
    center,
    nodes: [...seen].map((entry) => nodes.get(entry)!),
    edges: usable.filter((edge) => seen.has(edge.from) && seen.has(edge.to)),
    truncated,
  };
}

export interface PathStep {
  from: NodeRef;
  /** How `from` relates to `to`, read in that direction. */
  label: string;
  to: NodeRef;
}

/**
 * The shortest way from one node to another along any kind of fact: how a
 * cousin, a house and a company are connected. Null when they are not.
 */
export async function findPath(
  actor: Actor,
  fromKey: string,
  toKey: string,
): Promise<{ from: NodeRef; to: NodeRef; steps: PathStep[] | null } | null> {
  assertCan(actor, "read");
  const { nodes, edges } = await loadGraph();
  const from = nodes.get(fromKey);
  const to = nodes.get(toKey);
  if (!from || !to) return null;
  const next = new Map<string, { key: string; label: string }[]>();
  const link = (a: string, b: string, label: string) =>
    next.set(a, [...(next.get(a) ?? []), { key: b, label }]);
  for (const edge of edges) {
    link(edge.from, edge.to, edge.label);
    link(edge.to, edge.from, edge.inverse);
  }
  const came = new Map<string, { key: string; label: string } | null>([[fromKey, null]]);
  const queue = [fromKey];
  while (queue.length > 0 && !came.has(toKey)) {
    const at = queue.shift()!;
    for (const step of next.get(at) ?? []) {
      if (came.has(step.key)) continue;
      came.set(step.key, { key: at, label: step.label });
      queue.push(step.key);
    }
  }
  if (!came.has(toKey)) return { from, to, steps: null };
  const steps: PathStep[] = [];
  for (let at = toKey; came.get(at); at = came.get(at)!.key) {
    const back = came.get(at)!;
    steps.unshift({ from: nodes.get(back.key)!, label: back.label, to: nodes.get(at)! });
  }
  return { from, to, steps };
}
