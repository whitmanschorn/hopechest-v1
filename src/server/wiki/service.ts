import { getDb } from "@/lib/db";
import { slugify, uniqueSlug } from "@/lib/slug";
import { changeSize, diffLines, type DiffLine } from "@/lib/wiki/diff";
import { MAX_BODY_LENGTH, type LinkTarget } from "@/lib/wiki/markup";
import { assertCan, can, type Actor } from "@/server/actor";

/**
 * The wiki: a page of prose for each person, and topic pages of their own.
 * Anyone who can add things can edit any page; every save keeps the whole
 * text as a revision, so nothing written is ever lost and any version can be
 * brought back.
 */

/** Which page: a person's (by the person's slug) or a topic (by its own). */
export type ArticleRef = { kind: "person"; slug: string } | { kind: "topic"; slug: string };

export interface ArticleView {
  ref: ArticleRef;
  title: string;
  body: string;
  /** False for a person nobody has written about yet. */
  exists: boolean;
  /** The latest revision: sent back when saving, to notice someone else's edit. */
  revisionId: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  canEdit: boolean;
}

const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const authorInclude = {
  authorUser: { select: { person: { select: { displayName: true } } } },
  authorApiKey: { select: { name: true } },
} as const;

type AuthorRow = {
  authorLabel: string | null;
  authorUser: { person: { displayName: string } | null } | null;
  authorApiKey: { name: string } | null;
};

const authorOf = (row: AuthorRow): string =>
  row.authorUser?.person?.displayName ?? row.authorApiKey?.name ?? row.authorLabel ?? "Someone";

/** The article row behind a ref, and for a person's page the person too. */
async function find(ref: ArticleRef) {
  const db = getDb();
  const latest = {
    revisions: { orderBy: { createdAt: "desc" }, take: 1, include: authorInclude },
  } as const;
  if (ref.kind === "topic") {
    const article = await db.article.findFirst({
      where: { slug: ref.slug, personId: null },
      include: latest,
    });
    return { article, person: null };
  }
  const person = await db.person.findUnique({
    where: { slug: ref.slug },
    select: { id: true, slug: true, displayName: true, article: { include: latest } },
  });
  return { article: person?.article ?? null, person };
}

export async function getArticle(actor: Actor, ref: ArticleRef): Promise<ArticleView | null> {
  assertCan(actor, "read");
  const { article, person } = await find(ref);
  if (!article && !person) return null;
  const last = article?.revisions[0];
  return {
    ref,
    title: person?.displayName ?? article!.title,
    body: article?.body ?? "",
    exists: article !== null,
    revisionId: last?.id ?? null,
    updatedAt: last?.createdAt ?? null,
    updatedBy: last ? authorOf(last) : null,
    canEdit: can(actor, "write"),
  };
}

export interface ArticleCard {
  ref: ArticleRef;
  title: string;
  /** The opening words, for a list. */
  opening: string;
  updatedAt: Date;
}

const openingOf = (body: string) => {
  const first = body
    .split("\n")
    .find((line) => line.trim() && !/^(#|>|[-*]\s|\d+[.)]\s)/.test(line));
  const plain = (first ?? "").replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1").replace(/\*+/g, "");
  return plain.length > 180 ? `${plain.slice(0, 177).trimEnd()}…` : plain;
};

/** Every page, topics first, each by title. */
export async function listArticles(
  actor: Actor,
): Promise<{ topics: ArticleCard[]; people: ArticleCard[] }> {
  assertCan(actor, "read");
  const rows = await getDb().article.findMany({
    orderBy: [{ title: "asc" }, { id: "asc" }],
    select: {
      slug: true,
      title: true,
      body: true,
      updatedAt: true,
      person: { select: { slug: true, displayName: true } },
    },
  });
  const card = (row: (typeof rows)[number]): ArticleCard => ({
    ref: row.person ? { kind: "person", slug: row.person.slug } : { kind: "topic", slug: row.slug },
    title: row.person?.displayName ?? row.title,
    opening: openingOf(row.body),
    updatedAt: row.updatedAt,
  });
  return {
    topics: rows.filter((row) => !row.person).map(card),
    people: rows
      .filter((row) => row.person)
      .map(card)
      .sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export type ArticleErrors = Partial<Record<"title" | "body" | "base", string>>;

export interface ArticleInput {
  /** For a topic. A person's page is always titled with their name. */
  title?: string;
  body: string;
  /** A line on what changed, shown in the history. */
  summary?: string;
  /**
   * The revision the editor started from. If the page has moved on since,
   * the save is refused rather than silently undoing someone else's work.
   */
  base?: string | null;
  /** Who to show as the author when it is not the caller: an import, a licence. */
  authorLabel?: string;
}

export type SaveResult =
  | { ok: true; ref: ArticleRef; changed: boolean }
  | { ok: false; errors: ArticleErrors; status?: 404 };

/**
 * Saves a page, making it if it is not there: `ref` null starts a new topic
 * from its title. Every save that changes something adds a revision.
 */
export async function saveArticle(
  actor: Actor,
  ref: ArticleRef | null,
  input: ArticleInput,
): Promise<SaveResult> {
  assertCan(actor, "write");
  const errors: ArticleErrors = {};
  const body = tidy(input.body);
  if (body.length > MAX_BODY_LENGTH) errors.body = "That is longer than a page here can be.";
  const { article, person } = ref ? await find(ref) : { article: null, person: null };
  if (ref?.kind === "person" && !person) {
    return { ok: false, errors: { title: "That person is not in the chest." }, status: 404 };
  }
  if (ref?.kind === "topic" && !article) {
    return { ok: false, errors: { title: "There is no such page." }, status: 404 };
  }

  const title = person ? person.displayName : (input.title ?? article?.title ?? "").trim();
  if (!title) errors.title = "Give the page a title.";
  else if (title.length > 120) errors.title = "Keep the title under 120 characters.";
  if (!article && !body) errors.body = "Write something first.";
  const latest = article?.revisions[0]?.id ?? null;
  if (article && input.base !== undefined && input.base !== latest) {
    errors.base =
      "Someone else saved this page while you were editing. Copy your changes, reload, and add them to the newer version.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const db = getDb();
  const author =
    input.authorLabel !== undefined
      ? { authorLabel: input.authorLabel.slice(0, 120) }
      : actor.kind === "user"
        ? { authorUserId: actor.userId }
        : { authorApiKeyId: actor.apiKeyId };
  const summary = input.summary?.trim().slice(0, 200) || null;

  if (article) {
    const same = article.body === body && article.title === title;
    if (!same) {
      await db.$transaction([
        db.article.update({ where: { id: article.id }, data: { title, body } }),
        db.articleRevision.create({
          data: { articleId: article.id, title, body, summary, ...author },
        }),
      ]);
    }
    return { ok: true, ref: ref!, changed: !same };
  }

  let slug: string;
  if (person) {
    // Never shown: a person's page is reached through the person.
    slug = `person-${person.id}`;
  } else {
    const [articles, people] = await Promise.all([
      db.article.findMany({ select: { slug: true } }),
      db.person.findMany({ select: { slug: true } }),
    ]);
    // A topic may not take a person's slug, so [[links]] by slug stay unambiguous.
    const taken = new Set([...articles, ...people].map((row) => row.slug).concat(["new"]));
    slug = uniqueSlug(slugify(title), taken, "page");
  }
  await db.article.create({
    data: {
      slug,
      title,
      body,
      personId: person?.id ?? null,
      revisions: { create: { title, body, summary: summary ?? "Started the page", ...author } },
    },
  });
  return { ok: true, ref: person ? ref! : { kind: "topic", slug }, changed: true };
}

export interface RevisionCard {
  id: string;
  author: string;
  savedAt: Date;
  summary: string | null;
  /** Lines added and removed compared with the version before. */
  added: number;
  removed: number;
  current: boolean;
}

/** A page's versions, newest first. */
export async function getHistory(actor: Actor, ref: ArticleRef): Promise<RevisionCard[] | null> {
  assertCan(actor, "read");
  const { article, person } = await find(ref);
  if (!article) return person ? [] : null;
  const revisions = await getDb().articleRevision.findMany({
    where: { articleId: article.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    include: authorInclude,
  });
  return revisions
    .map((revision, index) => ({
      id: revision.id,
      author: authorOf(revision),
      savedAt: revision.createdAt,
      summary: revision.summary,
      ...changeSize(diffLines(revisions[index - 1]?.body ?? "", revision.body)),
      current: index === revisions.length - 1,
    }))
    .reverse();
}

export interface RevisionView extends Omit<RevisionCard, "added" | "removed"> {
  title: string;
  body: string;
  /** What this version changed from the one before it. */
  changes: DiffLine[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRevision(
  actor: Actor,
  ref: ArticleRef,
  revisionId: string,
): Promise<RevisionView | null> {
  assertCan(actor, "read");
  const { article } = await find(ref);
  if (!article || !UUID.test(revisionId)) return null;
  const db = getDb();
  const revision = await db.articleRevision.findFirst({
    where: { id: revisionId, articleId: article.id },
    include: authorInclude,
  });
  if (!revision) return null;
  const before = await db.articleRevision.findFirst({
    where: { articleId: article.id, createdAt: { lt: revision.createdAt } },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });
  return {
    id: revision.id,
    author: authorOf(revision),
    savedAt: revision.createdAt,
    summary: revision.summary,
    current: article.revisions[0]?.id === revision.id,
    title: revision.title,
    body: revision.body,
    changes: diffLines(before?.body ?? "", revision.body),
  };
}

/** Brings an earlier version back, as a new revision on top: nothing is erased. */
export async function restoreRevision(
  actor: Actor,
  ref: ArticleRef,
  revisionId: string,
): Promise<SaveResult> {
  assertCan(actor, "write");
  const revision = await getRevision(actor, ref, revisionId);
  if (!revision) return { ok: false, errors: { base: "There is no such version." }, status: 404 };
  const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(revision.savedAt);
  return saveArticle(actor, ref, {
    title: revision.title,
    body: revision.body,
    summary: `Brought back the version of ${day} by ${revision.author}`,
  });
}

/** Deletes a page and all its versions. For admins: it cannot be undone. */
export async function deleteArticle(actor: Actor, ref: ArticleRef): Promise<boolean> {
  assertCan(actor, "admin");
  const { article } = await find(ref);
  if (!article) return false;
  await getDb().article.delete({ where: { id: article.id } });
  return true;
}

/** Everything a [[link]] can point at: people, topic pages and places. */
export async function linkTargets(actor: Actor): Promise<LinkTarget[]> {
  assertCan(actor, "read");
  const db = getDb();
  const [people, topics, places] = await Promise.all([
    db.person.findMany({
      select: {
        slug: true,
        displayName: true,
        givenName: true,
        familyName: true,
        nicknames: true,
        alternateNames: true,
      },
    }),
    db.article.findMany({ where: { personId: null }, select: { slug: true, title: true } }),
    db.place.findMany({ select: { slug: true, label: true } }),
  ]);
  return [
    ...people.map((person) => ({
      href: `/people/${person.slug}`,
      rank: 0,
      names: [
        person.slug,
        person.displayName,
        [person.givenName, person.familyName].filter(Boolean).join(" "),
        ...person.nicknames,
        ...person.alternateNames,
      ].filter(Boolean),
    })),
    ...topics.map((topic) => ({
      href: `/wiki/${topic.slug}`,
      rank: 1,
      names: [topic.slug, topic.title],
    })),
    ...places.map((place) => ({
      href: `/places/${place.slug}`,
      rank: 2,
      names: [place.slug, place.label],
    })),
  ];
}
