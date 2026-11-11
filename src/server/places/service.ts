import { getDb } from "@/lib/db";
import {
  diffPlace,
  parsePlaceForm,
  type PlaceErrors,
  type PlaceFormInput,
  type PlaceValues,
} from "@/lib/places/placeEdit";
import { slugify, uniqueSlug } from "@/lib/slug";
import { assertCan, type Actor } from "@/server/actor";
import { recordChanges } from "@/server/changelog";

export interface PlaceView {
  id: string;
  slug: string;
  values: PlaceValues;
  /** How many events happened here. */
  eventCount: number;
}

interface PlaceRow extends PlaceValues {
  id: string;
  slug: string;
  _count: { events: number };
}

function toView(row: PlaceRow): PlaceView {
  return {
    id: row.id,
    slug: row.slug,
    values: {
      label: row.label,
      street: row.street,
      city: row.city,
      region: row.region,
      country: row.country,
      lat: row.lat,
      lng: row.lng,
      notes: row.notes,
    },
    eventCount: row._count.events,
  };
}

const WITH_COUNT = { _count: { select: { events: true } } } as const;

/** Every place, by name. */
export async function listPlaces(actor: Actor): Promise<PlaceView[]> {
  assertCan(actor, "read");
  const rows = await getDb().place.findMany({ include: WITH_COUNT });
  return rows.map(toView).sort((a, b) => a.values.label.localeCompare(b.values.label));
}

export async function getPlace(actor: Actor, slug: string): Promise<PlaceView | null> {
  assertCan(actor, "read");
  const row = await getDb().place.findUnique({ where: { slug }, include: WITH_COUNT });
  return row ? toView(row) : null;
}

/** For pickers: every place's slug and name. */
export async function listPlaceOptions(actor: Actor): Promise<{ value: string; label: string }[]> {
  assertCan(actor, "read");
  const places = await getDb().place.findMany({
    select: { slug: true, label: true },
    orderBy: { label: "asc" },
  });
  return places.map((place) => ({ value: place.slug, label: place.label }));
}

export type SavePlaceResult =
  { ok: true; slug: string } | { ok: false; errors: PlaceErrors; message?: string };

export async function createPlace(actor: Actor, form: PlaceFormInput): Promise<SavePlaceResult> {
  assertCan(actor, "write");
  const parsed = parsePlaceForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;
  const db = getDb();

  const taken = new Set(
    (await db.place.findMany({ select: { slug: true } })).map((place) => place.slug),
  );
  // "/places/new" is the form, so a place called "New" cannot have that address.
  taken.add("new");
  const slug = uniqueSlug(slugify(values.label), taken, "place");
  await db.$transaction(async (tx) => {
    const place = await tx.place.create({ data: { slug, ...values } });
    await recordChanges(tx, actor, "place", place.id, [
      { field: "created", before: null, after: values.label },
    ]);
  });
  return { ok: true, slug };
}

/** The address of a place stays the same when it is renamed, so links keep working. */
export async function updatePlace(
  actor: Actor,
  slug: string,
  form: PlaceFormInput,
): Promise<SavePlaceResult> {
  assertCan(actor, "write");
  const parsed = parsePlaceForm(form);
  if (!parsed.ok) return parsed;
  const { values } = parsed;

  return getDb().$transaction(async (tx): Promise<SavePlaceResult> => {
    const row = await tx.place.findUnique({ where: { slug }, include: WITH_COUNT });
    if (!row) return { ok: false, errors: {}, message: "This place is no longer in the chest." };
    const changes = diffPlace(toView(row).values, values);
    if (changes.length === 0) return { ok: true, slug };
    await tx.place.update({ where: { id: row.id }, data: values });
    await recordChanges(tx, actor, "place", row.id, changes);
    return { ok: true, slug };
  });
}

/**
 * Removes a place. Events that happened there are kept and lose their place.
 * Returns false if it was already gone.
 */
export async function deletePlace(actor: Actor, slug: string): Promise<boolean> {
  assertCan(actor, "write");
  return getDb().$transaction(async (tx) => {
    const place = await tx.place.findUnique({
      where: { slug },
      select: { id: true, label: true, events: { select: { id: true } } },
    });
    if (!place) return false;
    for (const event of place.events) {
      await recordChanges(tx, actor, "event", event.id, [
        { field: "place", before: place.label, after: null },
      ]);
    }
    // The foreign keys clear the place on its events, photos and documents.
    await tx.place.delete({ where: { id: place.id } });
    await recordChanges(tx, actor, "place", place.id, [
      { field: "deleted", before: place.label, after: null },
    ]);
    return true;
  });
}
