// Loads a seed directory into the database.
// Usage: node scripts/seed.ts [family]   (default "bluth"; reads seed/<family>/)
//
// Safe to re-run: every row is matched on a stable key and updated in place,
// and nothing outside the seed is touched. Refuses to run in production.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { getChestConfig } from "../src/lib/chest.ts";
import { toColumns } from "../src/lib/fuzzyDate.ts";
import {
  chunkMarkdown,
  parseSeedDocument,
  resolveDate,
  validateSeed,
  type SeedData,
} from "./lib/seedData.ts";

loadEnv({ path: ".env.local", quiet: true });

const family = process.argv[2] ?? "bluth";
const dir = join("seed", family);

function fail(message: string): never {
  console.error(`Seed refused: ${message}`);
  process.exit(1);
}

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
}

function upper<T extends string>(value: T): Uppercase<T> {
  return value.toUpperCase() as Uppercase<T>;
}

if (!existsSync(dir)) fail(`no directory ${dir}`);
const chest = getChestConfig();
if (chest.env === "production") fail("seeds are sample data and never go into a family's site");
if (chest.slug !== family) {
  fail(`this deployment serves "${chest.slug}", not "${family}" (CHEST_SLUG)`);
}

const docsDir = join(dir, "documents");
const data: SeedData = {
  people: readJson("people.json"),
  relationships: readJson("relationships.json"),
  places: readJson("places.json"),
  events: readJson("events.json"),
  documents: existsSync(docsDir)
    ? readdirSync(docsDir)
        .filter((name) => name.endsWith(".md"))
        .sort()
        .map((name) =>
          parseSeedDocument(name.replace(/\.md$/, ""), readFileSync(join(docsDir, name), "utf8")),
        )
    : [],
  users: existsSync(join(dir, "users.json")) ? readJson("users.json") : [],
};

const problems = validateSeed(data);
if (problems.length > 0) fail(`${dir} has problems:\n  - ${problems.join("\n  - ")}`);

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!connectionString) fail("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  const personIds = new Map<string, string>();
  for (const person of data.people) {
    const fields = {
      displayName: person.displayName,
      givenName: person.givenName ?? null,
      familyName: person.familyName ?? null,
      birthFamilyName: person.birthFamilyName ?? null,
      nicknames: person.nicknames ?? [],
      alternateNames: person.alternateNames ?? [],
      gender: person.gender ? upper(person.gender) : null,
      isLiving: person.isLiving ?? null,
      notes: person.notes ?? null,
    };
    const row = await db.person.upsert({
      where: { slug: person.slug },
      create: { slug: person.slug, ...fields },
      update: fields,
      select: { id: true },
    });
    personIds.set(person.slug, row.id);
  }
  const personId = (slug: string) => personIds.get(slug)!;

  for (const rel of data.relationships) {
    let [fromPersonId, toPersonId] = [personId(rel.from), personId(rel.to)];
    // Partners are stored with the smaller id first, so each pair has one row.
    if (rel.type === "partner" && fromPersonId > toPersonId) {
      [fromPersonId, toPersonId] = [toPersonId, fromPersonId];
    }
    const key = {
      type: upper(rel.type),
      fromPersonId,
      toPersonId,
      qualifier: upper(rel.qualifier),
    };
    const fields = {
      endReason: rel.endReason ? upper(rel.endReason) : null,
      note: rel.note ?? null,
    };
    await db.relationship.upsert({
      where: { type_fromPersonId_toPersonId_qualifier: key },
      create: { ...key, ...fields },
      update: fields,
    });
  }

  const placeIds = new Map<string, string>();
  for (const place of data.places) {
    const fields = {
      label: place.label,
      street: place.street ?? null,
      city: place.city ?? null,
      region: place.region ?? null,
      country: place.country ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
      notes: place.notes ?? null,
    };
    const row = await db.place.upsert({
      where: { slug: place.slug },
      create: { slug: place.slug, ...fields },
      update: fields,
      select: { id: true },
    });
    placeIds.set(place.slug, row.id);
  }

  const eventIds = new Map<string, string>();
  for (const event of data.events) {
    const fields = {
      kind: upper(event.kind),
      title: event.title,
      description: event.description ?? null,
      placeId: event.place ? placeIds.get(event.place)! : null,
      ...toColumns(resolveDate(event.date)),
    };
    await db.$transaction(async (tx) => {
      const row = await tx.event.upsert({
        where: { slug: event.slug },
        create: { slug: event.slug, ...fields },
        update: fields,
        select: { id: true },
      });
      eventIds.set(event.slug, row.id);
      await tx.eventParticipant.deleteMany({ where: { eventId: row.id } });
      await tx.eventParticipant.createMany({
        data: event.participants.map((participant) => ({
          eventId: row.id,
          personId: personId(participant.person),
          role: upper(participant.role ?? "subject"),
        })),
      });
    });
  }

  const sourceIds = new Map<string, string>();
  for (const doc of data.documents) {
    const sha256 = createHash("sha256").update(doc.text).digest("hex");
    const article = doc.kind === "article";
    // A wiki page is matched on where it came from, a family paper on its
    // title, so an edited seed file replaces its earlier text instead of
    // adding a second copy.
    const existing = await db.document.findFirst({
      where: article
        ? { originalUrl: doc.sourceUrl }
        : { kind: upper(doc.kind), title: doc.title, originalUrl: null },
      select: { id: true, sha256: true },
    });
    const sourceKind = article ? ("EXTERNAL" as const) : ("DOCUMENT" as const);
    const sourceFields = {
      citation: article ? `${doc.title} (Arrested Development Wiki, ${doc.license})` : doc.title,
      url: doc.sourceUrl ?? null,
    };

    await db.$transaction(async (tx) => {
      let id = existing?.id;
      if (existing?.sha256 !== sha256) {
        const fields = {
          sha256,
          kind: upper(doc.kind),
          title: doc.title,
          originalUrl: doc.sourceUrl ?? null,
          mimeType: "text/markdown",
          bytes: Buffer.byteLength(doc.text),
          text: doc.text,
          ...toColumns(resolveDate(doc.date)),
        };
        const row = existing
          ? await tx.document.update({ where: { id: existing.id }, data: fields })
          : await tx.document.create({ data: fields });
        id = row.id;
        await tx.documentChunk.deleteMany({ where: { documentId: row.id } });
        await tx.documentChunk.createMany({
          data: chunkMarkdown(doc.text).map((chunk, position) => ({
            documentId: row.id,
            position,
            ...chunk,
          })),
        });
      }
      const source = await tx.source.findFirst({
        where: { documentId: id, kind: sourceKind },
        select: { id: true },
      });
      const saved = source
        ? await tx.source.update({ where: { id: source.id }, data: sourceFields })
        : await tx.source.create({ data: { kind: sourceKind, documentId: id, ...sourceFields } });
      sourceIds.set(doc.slug, saved.id);
    });
  }

  // An event recorded in a document is tied to it by an accepted claim, the
  // same trail a reviewer leaves when accepting something an agent proposed.
  for (const event of data.events) {
    for (const slug of event.sources ?? []) {
      const link = {
        sourceId: sourceIds.get(slug)!,
        appliedType: "event",
        appliedId: eventIds.get(event.slug)!,
      };
      const fields = {
        status: "ACCEPTED" as const,
        statement: event.title,
        action: "event.create",
        payload: { slug: event.slug },
        createdByAgent: "seed",
      };
      const claim = await db.claim.findFirst({ where: link, select: { id: true } });
      if (claim) await db.claim.update({ where: { id: claim.id }, data: fields });
      else await db.claim.create({ data: { ...link, ...fields } });
    }
  }

  // Test accounts, so specs can sign in as a known family member.
  for (const user of data.users ?? []) {
    const fields = {
      role: upper(user.role),
      personId: user.person ? personId(user.person) : null,
    };
    await db.user.upsert({
      where: { phone: user.phone },
      create: { phone: user.phone, ...fields, onboardedAt: new Date() },
      update: fields,
    });
  }

  console.log(
    `Seeded ${family}: ${data.people.length} people, ${data.relationships.length} relationships, ` +
      `${data.places.length} places, ${data.events.length} events, ${data.documents.length} documents.`,
  );
} finally {
  await db.$disconnect();
}
