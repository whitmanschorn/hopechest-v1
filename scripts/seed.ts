// Loads a seed directory into the database.
// Usage: node scripts/seed.ts [family]   (default "bluth"; reads seed/<family>/)
//
// Safe to re-run: every row is matched on a stable key and updated in place,
// and nothing outside the seed is touched. Refuses to run in production.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { getChestConfig } from "../src/lib/chest.ts";
import { toColumns } from "../src/lib/fuzzyDate.ts";
import { BUILTIN_PREDICATES, checkFact, type NodeKind } from "../src/lib/graph/vocabulary.ts";
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
/**
 * Puts a file where the app reads files from: the private Vercel Blob store
 * when its token is set, otherwise the local folder (see src/server/storage).
 */
async function storeFile(key: string, body: Buffer, contentType: string): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    await put(key, body, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return;
  }
  const path = join(process.env.FILES_DIR ?? ".data/files", key);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

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
    const scanPath = doc.scan ? join(dir, "files", doc.scan) : null;
    if (scanPath && !existsSync(scanPath)) fail(`document "${doc.slug}": no file ${scanPath}`);
    const scan = scanPath ? readFileSync(scanPath) : null;
    const hash = createHash("sha256").update(doc.text);
    if (scan) hash.update(scan);
    const sha256 = hash.digest("hex");
    const article = doc.kind === "article";
    // A wiki page is matched on where it came from, a family paper on its
    // title, so an edited seed file replaces its earlier text instead of
    // adding a second copy.
    const existing = await db.document.findFirst({
      where: article ? { originalUrl: doc.sourceUrl } : { kind: upper(doc.kind), title: doc.title },
      select: { id: true, sha256: true },
    });
    const sourceKind = article ? ("EXTERNAL" as const) : ("DOCUMENT" as const);
    const sourceFields = {
      citation: article ? `${doc.title} (Arrested Development Wiki, ${doc.license})` : doc.title,
      url: doc.sourceUrl ?? null,
    };

    // The database can be shared between checkouts while local files are not:
    // an unchanged document may still be missing its scan in this folder.
    if (scan && existing?.sha256 === sha256 && !process.env.BLOB_READ_WRITE_TOKEN) {
      const type = doc.scan!.endsWith(".png") ? "image/png" : "image/jpeg";
      const key = `documents/${existing.id}/original.${doc.scan!.endsWith(".png") ? "png" : "jpg"}`;
      if (!existsSync(join(process.env.FILES_DIR ?? ".data/files", key))) {
        await storeFile(key, scan, type);
      }
    }

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
        if (scan) {
          // The picture of the original paper, served like any other private file.
          const type = doc.scan!.endsWith(".png") ? "image/png" : "image/jpeg";
          const key = `documents/${row.id}/original.${doc.scan!.endsWith(".png") ? "png" : "jpg"}`;
          await storeFile(key, scan, type);
          await tx.document.update({
            where: { id: row.id },
            data: { originalUrl: `/api/files/${key}`, mimeType: type, bytes: scan.byteLength },
          });
        }
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

  // Wiki pages: each wiki article becomes a page, a person's own where the
  // seed says so and a topic page otherwise. A page someone has edited since
  // is left alone, so re-seeding staging never undoes a person's writing.
  const SEED_AUTHOR = "Arrested Development Wiki (CC BY-SA)";
  const articleOwner = new Map(
    data.people.filter((p) => p.article).map((p) => [p.article!, p.slug]),
  );
  let pages = 0;
  for (const doc of data.documents) {
    if (doc.kind !== "article") continue;
    const owner = articleOwner.get(doc.slug);
    const body = `${doc.text}\n\n*From the Arrested Development Wiki, ${doc.license.replace(/\s*\(.*\)$/, "")}.* [Where it came from](${doc.sourceUrl})`;
    const title = owner ? data.people.find((p) => p.slug === owner)!.displayName : doc.title;
    const existing = owner
      ? await db.article.findUnique({
          where: { personId: personId(owner) },
          include: { revisions: { select: { authorLabel: true } } },
        })
      : await db.article.findFirst({
          where: { slug: doc.slug, personId: null },
          include: { revisions: { select: { authorLabel: true } } },
        });
    const revision = { title, body, authorLabel: SEED_AUTHOR };
    if (!existing) {
      await db.article.create({
        data: {
          slug: owner ? `person-${personId(owner)}` : doc.slug,
          title,
          body,
          personId: owner ? personId(owner) : null,
          revisions: { create: { ...revision, summary: "Copied from the wiki" } },
        },
      });
      pages++;
    } else if (
      (existing.body !== body || existing.title !== title) &&
      existing.revisions.every((entry) => entry.authorLabel === SEED_AUTHOR)
    ) {
      await db.$transaction([
        db.article.update({ where: { id: existing.id }, data: { title, body } }),
        db.articleRevision.create({
          data: { articleId: existing.id, ...revision, summary: "Updated from the wiki" },
        }),
      ]);
      pages++;
    }
  }

  // The looser facts of the graph: what kind of thing each topic page is, and
  // who worked where, owned what, lived where. Each names the document it
  // rests on. A fact already there (same subject, predicate and object or
  // value) is left as it is.
  const graphFile = join(dir, "graph.json");
  let factsAdded = 0;
  if (existsSync(graphFile)) {
    const graph = JSON.parse(readFileSync(graphFile, "utf8")) as {
      kinds?: Record<string, string>;
      facts?: {
        subject: string;
        predicate: string;
        object?: string;
        value?: string;
        from?: string;
        until?: string;
        note?: string;
        source?: string;
      }[];
    };
    for (const [slug, kind] of Object.entries(graph.kinds ?? {})) {
      const updated = await db.entity.updateMany({
        where: { key: `page:${slug}` },
        data: { kind: upper(kind) as never },
      });
      if (updated.count === 0) fail(`graph.json: no wiki page "${slug}" to call a ${kind}`);
    }
    for (const fact of graph.facts ?? []) {
      const name = `${fact.subject} ${fact.predicate} ${fact.object ?? fact.value}`;
      const def = BUILTIN_PREDICATES.find((entry) => entry.key === fact.predicate);
      const subject = await db.entity.findUnique({ where: { key: fact.subject } });
      const object = fact.object
        ? await db.entity.findUnique({ where: { key: fact.object } })
        : null;
      if (!subject) fail(`graph.json: ${name}: nothing called ${fact.subject}`);
      if (fact.object && !object) fail(`graph.json: ${name}: nothing called ${fact.object}`);
      const problem = checkFact(
        def,
        subject.kind.toLowerCase() as NodeKind,
        object ? (object.kind.toLowerCase() as NodeKind) : null,
      );
      if (problem) fail(`graph.json: ${name}: ${problem}`);
      if (fact.source && !sourceIds.has(fact.source)) {
        fail(`graph.json: ${name}: no document "${fact.source}"`);
      }
      const isDate = def!.value === "date";
      const value = {
        objectId: object?.id ?? null,
        valueText: !object && !isDate ? (fact.value ?? null) : null,
        valueDate: !object && isDate ? (fact.value ?? null) : null,
      };
      const existing = await db.statement.findFirst({
        where: { subjectId: subject.id, predicate: fact.predicate, ...value },
        select: { id: true },
      });
      if (existing) continue;
      const when = fact.from ?? (isDate ? fact.value : undefined);
      await db.statement.create({
        data: {
          subjectId: subject.id,
          predicate: fact.predicate,
          ...value,
          fromDate: fact.from ?? null,
          untilDate: fact.until ?? null,
          sortKey: when ? toColumns(resolveDate(when)).dateSortKey : null,
          note: fact.note ?? null,
          sourceId: fact.source ? sourceIds.get(fact.source)! : null,
        },
      });
      factsAdded++;
    }
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
      `${data.places.length} places, ${data.events.length} events, ${data.documents.length} documents, ` +
      `${pages} wiki pages written, ${factsAdded} facts added.`,
  );
} finally {
  await db.$disconnect();
}
