import type { Prisma } from "@/generated/prisma/client";
import { maskPhone } from "@/lib/auth/phone";
import { getDb } from "@/lib/db";
import { fromColumns, toColumns, type FuzzyDate } from "@/lib/fuzzyDate";
import { buildGraph, describeKin, siblingsOf, type KinGraph, type KinLink } from "@/lib/kinship";
import { lifespan } from "@/lib/people/lifespan";
import {
  diffPerson,
  FIELD_LABELS,
  parsePersonForm,
  type GenderInput,
  type PersonErrors,
  type PersonField,
  type PersonFormInput,
  type PersonValues,
} from "@/lib/people/personEdit";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertCan, type Actor } from "@/server/actor";
import { recordChanges } from "@/server/changelog";

// ───────────────────────────── shapes ─────────────────────────────

export interface PersonRef {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  /** "1940–2012", "b. 1967", or null. */
  lifespan: string | null;
  /** How this person is related to the signed-in person: "grandmother". */
  kin: string | null;
  isYou: boolean;
}

export interface Relative extends PersonRef {
  relationshipId: string;
  /** "adoptive", "married"... Empty when not recorded. */
  qualifier: string;
  /** "divorced", "widowed"... for partners whose relationship ended. */
  ended: string | null;
  note: string | null;
}

export interface PersonEvent {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  date: FuzzyDate | null;
  place: string | null;
  /** Everyone else who took part. */
  with: { slug: string; displayName: string }[];
}

export interface PersonDetail extends PersonRef {
  values: PersonValues;
  parents: Relative[];
  children: Relative[];
  partners: Relative[];
  siblings: PersonRef[];
  events: PersonEvent[];
}

export const PARENT_QUALIFIERS = ["biological", "adoptive", "step", "foster", "legal"] as const;
export const PARTNER_QUALIFIERS = ["married", "partnered"] as const;
export const END_REASONS = ["divorce", "separation", "annulment", "death", "other"] as const;

const ENDED: Record<string, string> = {
  DIVORCE: "divorced",
  SEPARATION: "separated",
  ANNULMENT: "annulled",
  DEATH: "until death",
  OTHER: "ended",
};

// ───────────────────────────── reading ─────────────────────────────

type Db = ReturnType<typeof getDb> | Prisma.TransactionClient;

interface Family {
  refs: Map<string, PersonRef>;
  graph: KinGraph;
  relationships: Awaited<ReturnType<typeof loadRelationships>>;
}

function loadRelationships(db: Db) {
  return db.relationship.findMany({ orderBy: { createdAt: "asc" } });
}

/** A family fits in memory, and kinship needs the whole graph anyway. */
async function loadFamily(db: Db, actor: Actor): Promise<Family> {
  const [people, relationships, vitals] = await Promise.all([
    db.person.findMany({
      select: { id: true, slug: true, displayName: true, avatarUrl: true, gender: true },
    }),
    loadRelationships(db),
    db.event.findMany({
      where: { kind: { in: ["BIRTH", "DEATH"] } },
      include: { participants: { where: { role: "SUBJECT" }, select: { personId: true } } },
    }),
  ]);

  const links: KinLink[] = [];
  for (const rel of relationships) {
    if (rel.type === "PARTNER") {
      links.push({
        type: "partner",
        aId: rel.fromPersonId,
        bId: rel.toPersonId,
        married: rel.qualifier === "MARRIED",
        current: rel.endReason === null || rel.endReason === "DEATH",
        widowed: rel.endReason === "DEATH",
      });
    } else if (rel.qualifier !== "STEP" && rel.qualifier !== "FOSTER") {
      // Step and foster parents are shown on the page but are not lines of descent.
      links.push({ type: "parent", parentId: rel.fromPersonId, childId: rel.toPersonId });
    }
  }
  const graph = buildGraph(
    people.map((person) => ({
      id: person.id,
      gender: (person.gender?.toLowerCase() ?? null) as GenderInput | null,
    })),
    links,
  );

  const born = new Map<string, FuzzyDate | null>();
  const died = new Map<string, FuzzyDate | null>();
  for (const event of vitals) {
    const target = event.kind === "BIRTH" ? born : died;
    for (const { personId } of event.participants) target.set(personId, fromColumns(event));
  }

  const me = actor.kind === "user" ? actor.personId : null;
  const refs = new Map<string, PersonRef>();
  for (const person of people) {
    refs.set(person.id, {
      id: person.id,
      slug: person.slug,
      displayName: person.displayName,
      avatarUrl: person.avatarUrl,
      lifespan: lifespan(born.get(person.id) ?? null, died.get(person.id) ?? null),
      kin: me ? describeKin(graph, me, person.id) : null,
      isYou: me === person.id,
    });
  }
  return { refs, graph, relationships };
}

const byName = (a: { displayName: string }, b: { displayName: string }) =>
  a.displayName.localeCompare(b.displayName);

/** Everyone in the chest, by name. `query` matches any of a person's names. */
export async function listPeople(actor: Actor, query = ""): Promise<PersonRef[]> {
  assertCan(actor, "read");
  const db = getDb();
  const { refs } = await loadFamily(db, actor);
  const needle = query.trim().toLowerCase();
  if (!needle) return [...refs.values()].sort(byName);

  const names = await db.person.findMany({
    select: {
      id: true,
      displayName: true,
      givenName: true,
      familyName: true,
      birthFamilyName: true,
      nicknames: true,
      alternateNames: true,
    },
  });
  return names
    .filter((person) =>
      [
        person.displayName,
        person.givenName,
        person.familyName,
        person.birthFamilyName,
        ...person.nicknames,
        ...person.alternateNames,
      ].some((name) => name?.toLowerCase().includes(needle)),
    )
    .map((person) => refs.get(person.id)!)
    .sort(byName);
}

async function loadValues(db: Db, slug: string) {
  const person = await db.person.findUnique({
    where: { slug },
    include: {
      events: {
        where: { role: "SUBJECT", event: { kind: { in: ["BIRTH", "DEATH"] } } },
        include: { event: true },
      },
    },
  });
  if (!person) return null;
  const birth = person.events.find((p) => p.event.kind === "BIRTH")?.event ?? null;
  const death = person.events.find((p) => p.event.kind === "DEATH")?.event ?? null;
  const values: PersonValues = {
    displayName: person.displayName,
    givenName: person.givenName,
    familyName: person.familyName,
    birthFamilyName: person.birthFamilyName,
    nicknames: person.nicknames,
    alternateNames: person.alternateNames,
    gender: (person.gender?.toLowerCase() ?? null) as GenderInput | null,
    isLiving: person.isLiving,
    born: birth ? fromColumns(birth) : null,
    died: death ? fromColumns(death) : null,
    notes: person.notes,
  };
  return { person, values, birth, death };
}

export async function getPerson(actor: Actor, slug: string): Promise<PersonDetail | null> {
  assertCan(actor, "read");
  const db = getDb();
  const loaded = await loadValues(db, slug);
  if (!loaded) return null;
  const { person, values } = loaded;
  const [{ refs, graph, relationships }, participations] = await Promise.all([
    loadFamily(db, actor),
    db.eventParticipant.findMany({
      where: { personId: person.id },
      include: {
        event: {
          include: {
            place: { select: { label: true } },
            participants: { include: { person: { select: { slug: true, displayName: true } } } },
          },
        },
      },
    }),
  ]);

  const relative = (rel: (typeof relationships)[number], otherId: string): Relative => ({
    ...refs.get(otherId)!,
    relationshipId: rel.id,
    qualifier: rel.qualifier === "UNKNOWN" ? "" : rel.qualifier.toLowerCase(),
    ended: rel.endReason ? ENDED[rel.endReason] : null,
    note: rel.note,
  });
  const parents: Relative[] = [];
  const children: Relative[] = [];
  const partners: Relative[] = [];
  for (const rel of relationships) {
    const mine = rel.fromPersonId === person.id;
    if (!mine && rel.toPersonId !== person.id) continue;
    const other = mine ? rel.toPersonId : rel.fromPersonId;
    if (rel.type === "PARTNER") partners.push(relative(rel, other));
    else (mine ? children : parents).push(relative(rel, other));
  }

  const events: PersonEvent[] = participations
    // Undated events go last.
    .sort((a, b) => (a.event.dateSortKey ?? Infinity) - (b.event.dateSortKey ?? Infinity))
    .map(({ event }) => ({
      id: event.id,
      kind: event.kind.toLowerCase(),
      title: event.title,
      description: event.description,
      date: fromColumns(event),
      place: event.place?.label ?? null,
      with: event.participants.filter((p) => p.personId !== person.id).map((p) => p.person),
    }));

  return {
    ...refs.get(person.id)!,
    values,
    parents: parents.sort(byName),
    children: children.sort(byName),
    partners,
    siblings: siblingsOf(graph, person.id)
      .map((id) => refs.get(id)!)
      .sort(byName),
    events,
  };
}

/** For pickers: everyone's slug and name. */
export async function listPersonOptions(actor: Actor): Promise<{ value: string; label: string }[]> {
  assertCan(actor, "read");
  const people = await getDb().person.findMany({
    select: { slug: true, displayName: true },
    orderBy: { displayName: "asc" },
  });
  return people.map((person) => ({ value: person.slug, label: person.displayName }));
}

// ───────────────────────────── writing ─────────────────────────────

export type RelativeRole = "parent" | "child" | "partner";

export interface RelationInput {
  /** What the other person is to this one. */
  role: string;
  otherSlug: string;
  qualifier: string;
  endReason?: string;
}

type Upper<T extends string> = Uppercase<T>;
const upper = <T extends string>(value: T) => value.toUpperCase() as Upper<T>;

async function syncVital(
  tx: Prisma.TransactionClient,
  personId: string,
  displayName: string,
  kind: "BIRTH" | "DEATH",
  date: FuzzyDate | null,
  existingId: string | null,
): Promise<void> {
  if (existingId) {
    // Clearing the date keeps the event: it may carry a place or a description.
    await tx.event.update({ where: { id: existingId }, data: toColumns(date) });
  } else if (date) {
    await tx.event.create({
      data: {
        kind,
        title: `${displayName} ${kind === "BIRTH" ? "born" : "died"}`,
        ...toColumns(date),
        participants: { create: { personId, role: "SUBJECT" } },
      },
    });
  }
}

function personColumns(values: PersonValues) {
  return {
    displayName: values.displayName,
    givenName: values.givenName,
    familyName: values.familyName,
    birthFamilyName: values.birthFamilyName,
    nicknames: values.nicknames,
    alternateNames: values.alternateNames,
    gender: values.gender ? upper(values.gender) : null,
    isLiving: values.isLiving,
    notes: values.notes,
  };
}

export type SaveResult =
  { ok: true; slug: string } | { ok: false; errors: PersonErrors; message?: string };

/** Adds a person, optionally tied to someone already in the chest. */
export async function createPerson(
  actor: Actor,
  form: PersonFormInput,
  relation?: RelationInput,
): Promise<SaveResult> {
  assertCan(actor, "write");
  const parsed = parsePersonForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;
  const db = getDb();

  if (relation) {
    const problem = checkRelation(relation);
    if (problem) return { ok: false, errors: {}, message: problem };
    const other = await db.person.findUnique({ where: { slug: relation.otherSlug } });
    if (!other)
      return { ok: false, errors: {}, message: "That relative is no longer in the chest." };
  }

  const taken = new Set(
    (await db.person.findMany({ select: { slug: true } })).map((person) => person.slug),
  );
  const slug = uniqueSlug(slugify(values.displayName), taken, "person");

  await db.$transaction(async (tx) => {
    const person = await tx.person.create({ data: { slug, ...personColumns(values) } });
    await syncVital(tx, person.id, values.displayName, "BIRTH", values.born, null);
    await syncVital(tx, person.id, values.displayName, "DEATH", values.died, null);
    await recordChanges(tx, actor, "person", person.id, [
      { field: "created", before: null, after: values.displayName },
    ]);
    if (relation) await writeRelationship(tx, actor, person.id, relation);
  });
  return { ok: true, slug };
}

export async function updatePerson(
  actor: Actor,
  slug: string,
  form: PersonFormInput,
): Promise<SaveResult> {
  assertCan(actor, "write");
  const parsed = parsePersonForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;

  return getDb().$transaction(async (tx) => {
    const loaded = await loadValues(tx, slug);
    if (!loaded)
      return { ok: false, errors: {}, message: "This person is no longer in the chest." };
    const changes = diffPerson(loaded.values, values);
    if (changes.length === 0) return { ok: true, slug };

    const changed = new Set<PersonField>(changes.map((change) => change.field));
    await tx.person.update({ where: { id: loaded.person.id }, data: personColumns(values) });
    // Dates are only rewritten when they changed, so an untouched deduced date keeps its clue.
    if (changed.has("born")) {
      await syncVital(
        tx,
        loaded.person.id,
        values.displayName,
        "BIRTH",
        values.born,
        loaded.birth?.id ?? null,
      );
    }
    if (changed.has("died")) {
      await syncVital(
        tx,
        loaded.person.id,
        values.displayName,
        "DEATH",
        values.died,
        loaded.death?.id ?? null,
      );
    }
    await recordChanges(tx, actor, "person", loaded.person.id, changes);
    return { ok: true, slug };
  });
}

function checkRelation(input: RelationInput): string | null {
  if (!["parent", "child", "partner"].includes(input.role)) return "Choose how they are related.";
  const allowed: readonly string[] =
    input.role === "partner" ? PARTNER_QUALIFIERS : PARENT_QUALIFIERS;
  if (!allowed.includes(input.qualifier)) return "Choose what kind of relationship it is.";
  if (input.endReason) {
    if (input.role !== "partner") return "Only a partnership can have ended.";
    if (!(END_REASONS as readonly string[]).includes(input.endReason))
      return "Choose how it ended.";
  }
  return null;
}

function relationText(role: RelativeRole, qualifier: string, name: string): string {
  const noun = role === "parent" ? "Parent" : role === "child" ? "Child" : "Partner";
  return `${noun} (${qualifier}): ${name}`;
}

const INVERSE: Record<RelativeRole, RelativeRole> = {
  parent: "child",
  child: "parent",
  partner: "partner",
};

async function writeRelationship(
  tx: Prisma.TransactionClient,
  actor: Actor,
  personId: string,
  input: RelationInput,
): Promise<string | null> {
  const role = input.role as RelativeRole;
  const [person, other] = await Promise.all([
    tx.person.findUnique({ where: { id: personId }, select: { id: true, displayName: true } }),
    tx.person.findUnique({
      where: { slug: input.otherSlug },
      select: { id: true, displayName: true },
    }),
  ]);
  if (!person || !other) return "That person is no longer in the chest.";
  if (person.id === other.id) return "Someone cannot be related to themselves.";

  let type: "PARENT" | "PARTNER";
  let [fromPersonId, toPersonId] = [person.id, other.id];
  if (role === "partner") {
    type = "PARTNER";
    if (fromPersonId > toPersonId) [fromPersonId, toPersonId] = [toPersonId, fromPersonId];
  } else {
    type = "PARENT";
    if (role === "parent") [fromPersonId, toPersonId] = [other.id, person.id];
    // A child cannot also be an ancestor.
    const relationships = await tx.relationship.findMany({ where: { type: "PARENT" } });
    const graph = buildGraph(
      [],
      relationships.map((rel) => ({
        type: "parent",
        parentId: rel.fromPersonId,
        childId: rel.toPersonId,
      })),
    );
    const seen = new Set([toPersonId]);
    for (let frontier = [toPersonId]; frontier.length > 0;) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const child of graph.children.get(id) ?? []) {
          if (seen.has(child)) continue;
          seen.add(child);
          next.push(child);
        }
      }
      frontier = next;
    }
    if (seen.has(fromPersonId)) return "That would make someone their own ancestor.";
  }

  const qualifier = upper(input.qualifier) as Prisma.RelationshipCreateManyInput["qualifier"];
  const key = { type, fromPersonId, toPersonId, qualifier: qualifier! };
  const existing = await tx.relationship.findUnique({
    where: { type_fromPersonId_toPersonId_qualifier: key },
  });
  if (existing) return "That relationship is already recorded.";

  await tx.relationship.create({
    data: {
      ...key,
      endReason: input.endReason
        ? (upper(input.endReason) as Prisma.RelationshipCreateManyInput["endReason"])
        : null,
    },
  });
  // Each person's history shows the link from their side.
  await recordChanges(tx, actor, "person", person.id, [
    {
      field: "relationship",
      before: null,
      after: relationText(role, input.qualifier, other.displayName),
    },
  ]);
  await recordChanges(tx, actor, "person", other.id, [
    {
      field: "relationship",
      before: null,
      after: relationText(INVERSE[role], input.qualifier, person.displayName),
    },
  ]);
  return null;
}

/** Links two people already in the chest. Returns a message when it cannot. */
export async function addRelationship(
  actor: Actor,
  personSlug: string,
  input: RelationInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  assertCan(actor, "write");
  const problem = checkRelation(input);
  if (problem) return { ok: false, message: problem };
  return getDb().$transaction(async (tx) => {
    const person = await tx.person.findUnique({
      where: { slug: personSlug },
      select: { id: true },
    });
    if (!person) return { ok: false, message: "This person is no longer in the chest." };
    const failed = await writeRelationship(tx, actor, person.id, input);
    return failed ? { ok: false, message: failed } : { ok: true };
  });
}

export async function removeRelationship(actor: Actor, relationshipId: string): Promise<void> {
  assertCan(actor, "write");
  await getDb().$transaction(async (tx) => {
    const rel = await tx.relationship.findUnique({
      where: { id: relationshipId },
      include: { from: { select: { displayName: true } }, to: { select: { displayName: true } } },
    });
    if (!rel) return;
    await tx.relationship.delete({ where: { id: rel.id } });
    const qualifier = rel.qualifier.toLowerCase();
    const [fromRole, toRole]: [RelativeRole, RelativeRole] =
      rel.type === "PARTNER" ? ["partner", "partner"] : ["child", "parent"];
    await recordChanges(tx, actor, "person", rel.fromPersonId, [
      {
        field: "relationship",
        before: relationText(fromRole, qualifier, rel.to.displayName),
        after: null,
      },
    ]);
    await recordChanges(tx, actor, "person", rel.toPersonId, [
      {
        field: "relationship",
        before: relationText(toRole, qualifier, rel.from.displayName),
        after: null,
      },
    ]);
  });
}

// ───────────────────────────── history ─────────────────────────────

export interface HistoryEntry {
  id: string;
  at: Date;
  /** What changed, in words: "Nicknames", "Family". */
  what: string;
  before: string | null;
  after: string | null;
  by: string;
}

const HISTORY_LABELS: Record<string, string> = {
  ...FIELD_LABELS,
  relationship: "Family",
  created: "Added to the chest",
};

export async function getPersonHistory(
  actor: Actor,
  slug: string,
): Promise<{ person: { slug: string; displayName: string }; entries: HistoryEntry[] } | null> {
  assertCan(actor, "read");
  const db = getDb();
  const person = await db.person.findUnique({
    where: { slug },
    select: { id: true, slug: true, displayName: true },
  });
  if (!person) return null;
  const rows = await db.changelog.findMany({
    where: { entityType: "person", entityId: person.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    include: {
      actorUser: { select: { phone: true, person: { select: { displayName: true } } } },
      actorApiKey: { select: { name: true } },
    },
  });
  return {
    person: { slug: person.slug, displayName: person.displayName },
    entries: rows.map((row) => ({
      id: row.id,
      at: row.createdAt,
      what: HISTORY_LABELS[row.field] ?? row.field,
      before: row.before,
      after: row.after,
      by: row.actorUser
        ? (row.actorUser.person?.displayName ??
          (row.actorUser.phone === "demo-visitor"
            ? "A demo visitor"
            : maskPhone(row.actorUser.phone)))
        : row.actorApiKey
          ? `${row.actorApiKey.name} (API key)`
          : "Someone no longer here",
    })),
  };
}
