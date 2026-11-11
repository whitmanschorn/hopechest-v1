import { getDb } from "@/lib/db";
import { assertCan, type Actor } from "@/server/actor";

export interface ChestSummary {
  people: number;
  photos: number;
  events: number;
  places: number;
  documents: number;
}

/** How much the chest holds, for the home page. */
export async function getChestSummary(actor: Actor): Promise<ChestSummary> {
  assertCan(actor, "read");
  const db = getDb();
  const [people, photos, events, places, documents] = await Promise.all([
    db.person.count(),
    db.photo.count({ where: { status: "PUBLISHED" } }),
    db.event.count(),
    db.place.count(),
    db.document.count({ where: { status: "PUBLISHED" } }),
  ]);
  return { people, photos, events, places, documents };
}
