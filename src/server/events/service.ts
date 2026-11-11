import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { fromColumns, toColumns, type FuzzyDate } from "@/lib/fuzzyDate";
import {
  diffEvent,
  isEventKind,
  KIND_LABELS,
  parseEventForm,
  type EventErrors,
  type EventFormInput,
  type EventKindInput,
  type EventRoleInput,
  type EventValues,
} from "@/lib/events/eventEdit";
import { inDateOrder } from "@/lib/events/timeline";
import { assertCan, type Actor } from "@/server/actor";
import { recordChanges } from "@/server/changelog";
import { sourcesFor, type SourceRef } from "@/server/sources";

// ───────────────────────────── shapes ─────────────────────────────

export interface EventPerson {
  slug: string;
  displayName: string;
  role: EventRoleInput;
}

export interface EventView {
  id: string;
  kind: EventKindInput;
  title: string;
  description: string | null;
  date: FuzzyDate | null;
  place: { slug: string; label: string } | null;
  /** Subjects first, then everyone else, each by name. */
  participants: EventPerson[];
}

export interface EventFilter {
  /** An event kind such as "marriage". Anything else is ignored. */
  kind?: string;
  /** Slug of someone who took part. */
  person?: string;
  /** Slug of where it happened. */
  place?: string;
}

const INCLUDE = {
  place: { select: { slug: true, label: true } },
  participants: { include: { person: { select: { slug: true, displayName: true } } } },
} satisfies Prisma.EventInclude;

type EventRow = Prisma.EventGetPayload<{ include: typeof INCLUDE }>;
type Db = ReturnType<typeof getDb> | Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const upper = <T extends string>(value: T) => value.toUpperCase() as Uppercase<T>;

function toView(row: EventRow): EventView {
  return {
    id: row.id,
    kind: row.kind.toLowerCase() as EventKindInput,
    title: row.title,
    description: row.description,
    date: fromColumns(row),
    place: row.place,
    participants: row.participants
      .map((p) => ({
        slug: p.person.slug,
        displayName: p.person.displayName,
        role: p.role.toLowerCase() as EventRoleInput,
      }))
      .sort(
        (a, b) =>
          Number(b.role === "subject") - Number(a.role === "subject") ||
          a.displayName.localeCompare(b.displayName),
      ),
  };
}

/** What the form would hold for this event. */
export function eventValues(event: EventView): EventValues {
  return {
    kind: event.kind,
    title: event.title,
    description: event.description,
    date: event.date,
    place: event.place?.slug ?? null,
    participants: event.participants.map((p) => ({ person: p.slug, role: p.role })),
  };
}

// ───────────────────────────── reading ─────────────────────────────

/** Events in date order, undated last. */
export async function listEvents(actor: Actor, filter: EventFilter = {}): Promise<EventView[]> {
  assertCan(actor, "read");
  const where: Prisma.EventWhereInput = {};
  if (filter.kind && isEventKind(filter.kind)) where.kind = upper(filter.kind);
  if (filter.person) where.participants = { some: { person: { slug: filter.person } } };
  if (filter.place) where.place = { slug: filter.place };
  const rows = await getDb().event.findMany({ where, include: INCLUDE });
  return inDateOrder(rows.map(toView));
}

async function loadEvent(db: Db, id: string): Promise<EventView | null> {
  // Asking Postgres for a malformed uuid is an error, not a miss.
  if (!UUID.test(id)) return null;
  const row = await db.event.findUnique({ where: { id }, include: INCLUDE });
  return row ? toView(row) : null;
}

export async function getEvent(actor: Actor, id: string): Promise<EventView | null> {
  assertCan(actor, "read");
  return loadEvent(getDb(), id);
}

/** The documents and other sources this event is recorded in. */
export async function getEventSources(actor: Actor, id: string): Promise<SourceRef[]> {
  assertCan(actor, "read");
  return UUID.test(id) ? sourcesFor("event", id) : [];
}

// ───────────────────────────── writing ─────────────────────────────

export type SaveEventResult =
  { ok: true; id: string } | { ok: false; errors: EventErrors; message?: string };

interface Resolved {
  placeId: string | null;
  participants: { personId: string; role: Uppercase<EventRoleInput> }[];
  names: { people: Map<string, string>; places: Map<string, string> };
}

/** Looks up the slugs in `values` and applies the rules that need the database. */
async function resolve(
  tx: Prisma.TransactionClient,
  values: EventValues,
  eventId: string | null,
): Promise<{ ok: true; resolved: Resolved } | { ok: false; errors: EventErrors }> {
  const names = { people: new Map<string, string>(), places: new Map<string, string>() };

  let placeId: string | null = null;
  if (values.place) {
    const place = await tx.place.findUnique({
      where: { slug: values.place },
      select: { id: true, label: true },
    });
    if (!place) return { ok: false, errors: { place: "That place is no longer in the chest." } };
    placeId = place.id;
    names.places.set(values.place, place.label);
  }

  const people = await tx.person.findMany({
    where: { slug: { in: values.participants.map((p) => p.person) } },
    select: { id: true, slug: true, displayName: true },
  });
  const bySlug = new Map(people.map((person) => [person.slug, person]));
  if (bySlug.size !== values.participants.length) {
    return { ok: false, errors: { participants: "Someone chosen is no longer in the chest." } };
  }
  for (const person of people) names.people.set(person.slug, person.displayName);

  // People are born and die once: the person page reads its dates from these events.
  if (values.kind === "birth" || values.kind === "death") {
    const subject = bySlug.get(values.participants.find((p) => p.role === "subject")!.person)!;
    const other = await tx.event.findFirst({
      where: {
        kind: upper(values.kind),
        ...(eventId ? { id: { not: eventId } } : {}),
        participants: { some: { personId: subject.id, role: "SUBJECT" } },
      },
      select: { id: true },
    });
    if (other) {
      return {
        ok: false,
        errors: {
          participants: `${subject.displayName} already has a ${KIND_LABELS[values.kind].toLowerCase()} recorded.`,
        },
      };
    }
  }

  return {
    ok: true,
    resolved: {
      placeId,
      participants: values.participants.map((p) => ({
        personId: bySlug.get(p.person)!.id,
        role: upper(p.role),
      })),
      names,
    },
  };
}

function eventColumns(values: EventValues, placeId: string | null) {
  return {
    kind: upper(values.kind),
    title: values.title,
    description: values.description,
    placeId,
  };
}

export async function createEvent(actor: Actor, form: EventFormInput): Promise<SaveEventResult> {
  assertCan(actor, "write");
  const parsed = parseEventForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;

  return getDb().$transaction(async (tx): Promise<SaveEventResult> => {
    const checked = await resolve(tx, values, null);
    if (!checked.ok) return checked;
    const { placeId, participants } = checked.resolved;
    const event = await tx.event.create({
      data: {
        ...eventColumns(values, placeId),
        ...toColumns(values.date),
        participants: { create: participants },
      },
    });
    await recordChanges(tx, actor, "event", event.id, [
      { field: "created", before: null, after: values.title },
    ]);
    return { ok: true, id: event.id };
  });
}

export async function updateEvent(
  actor: Actor,
  id: string,
  form: EventFormInput,
): Promise<SaveEventResult> {
  assertCan(actor, "write");
  const parsed = parseEventForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;

  return getDb().$transaction(async (tx): Promise<SaveEventResult> => {
    const existing = await loadEvent(tx, id);
    if (!existing)
      return { ok: false, errors: {}, message: "This event is no longer in the chest." };
    const checked = await resolve(tx, values, id);
    if (!checked.ok) return checked;
    const { placeId, participants, names } = checked.resolved;

    // The names of what was there before, for the history.
    for (const p of existing.participants) names.people.set(p.slug, p.displayName);
    if (existing.place) names.places.set(existing.place.slug, existing.place.label);
    const changes = diffEvent(eventValues(existing), values, names);
    if (changes.length === 0) return { ok: true, id };
    const changed = new Set(changes.map((change) => change.field));

    await tx.event.update({
      where: { id },
      data: {
        ...eventColumns(values, placeId),
        // Only rewritten when changed, so an untouched date keeps exactly what was stored.
        ...(changed.has("date") || changed.has("clue") ? toColumns(values.date) : {}),
      },
    });
    if (changed.has("participants")) {
      await tx.eventParticipant.deleteMany({ where: { eventId: id } });
      await tx.eventParticipant.createMany({
        data: participants.map((p) => ({ eventId: id, ...p })),
      });
    }
    await recordChanges(tx, actor, "event", id, changes);
    return { ok: true, id };
  });
}

/** Removes an event. The people and the place stay. Returns false if it was already gone. */
export async function deleteEvent(actor: Actor, id: string): Promise<boolean> {
  assertCan(actor, "write");
  return getDb().$transaction(async (tx) => {
    const existing = await loadEvent(tx, id);
    if (!existing) return false;
    await tx.event.delete({ where: { id } });
    await recordChanges(tx, actor, "event", id, [
      { field: "deleted", before: existing.title, after: null },
    ]);
    return true;
  });
}
