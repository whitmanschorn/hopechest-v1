import { z } from "zod";
import { splitArguments } from "@/lib/api/match";
import { isClaimAction, MAX_QUOTE_LENGTH, type ClaimAction } from "@/lib/claims/actions";
import { getDb } from "@/lib/db";
import { assertCan, type Actor } from "@/server/actor";
import { TOOLS } from "@/server/mcp/tools";

/**
 * Proposed facts. Anything read out of a document by a model or an assistant,
 * and anything someone is not sure enough of to write straight in, arrives
 * here as a proposal: a change described but not made. A person accepts or
 * rejects it. Accepting makes the change through the same code as any other
 * edit and ties the result to its source, which is how an answer can later say
 * where a date came from.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ClaimStatusName = (typeof STATUSES)[number];

export interface ClaimView {
  id: string;
  status: ClaimStatusName;
  /** The fact in plain words. */
  statement: string;
  action: string;
  /** What accepting would send to `action`. */
  args: Record<string, unknown>;
  /** The words in the source the fact was read from. */
  quote: string | null;
  confidence: number | null;
  source: { citation: string; documentId: string | null; url: string | null } | null;
  proposedBy: string;
  proposedAt: Date;
  reviewedBy: string | null;
  reviewNote: string | null;
  /** What accepting it made or changed, once accepted. */
  applied: { type: string; id: string } | null;
  /** The page of what it made or changed, when there is one. */
  appliedHref: string | null;
}

const include = {
  source: { select: { citation: true, documentId: true, url: true } },
  createdBy: { select: { person: { select: { displayName: true } } } },
  reviewedBy: { select: { person: { select: { displayName: true } } } },
} as const;

type Row = {
  id: string;
  status: string;
  statement: string;
  action: string;
  payload: unknown;
  confidence: number | null;
  createdByAgent: string | null;
  createdAt: Date;
  reviewNote: string | null;
  appliedType: string | null;
  appliedId: string | null;
  source: ClaimView["source"];
  createdBy: { person: { displayName: string } | null } | null;
  reviewedBy: { person: { displayName: string } | null } | null;
};

function view(row: Row): ClaimView {
  const payload = (row.payload ?? {}) as { args?: unknown; quote?: unknown };
  // Claims written before proposals existed keep their arguments at the top level.
  const args = (payload.args ?? row.payload ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    status: row.status.toLowerCase() as ClaimStatusName,
    statement: row.statement,
    action: row.action,
    args,
    quote: typeof payload.quote === "string" ? payload.quote : null,
    confidence: row.confidence,
    source: row.source,
    proposedBy: row.createdBy?.person?.displayName ?? row.createdByAgent ?? "Someone",
    proposedAt: row.createdAt,
    reviewedBy: row.reviewedBy?.person?.displayName ?? null,
    reviewNote: row.reviewNote,
    applied: row.appliedType && row.appliedId ? { type: row.appliedType, id: row.appliedId } : null,
    appliedHref: null,
  };
}

/** Fills in where each accepted claim's result can be seen. */
async function withLinks(claims: ClaimView[]): Promise<ClaimView[]> {
  const ids = (type: string) =>
    claims.flatMap((claim) => (claim.applied?.type === type ? [claim.applied.id] : []));
  const db = getDb();
  const [people, places] = await Promise.all([
    db.person.findMany({ where: { id: { in: ids("person") } }, select: { id: true, slug: true } }),
    db.place.findMany({ where: { id: { in: ids("place") } }, select: { id: true, slug: true } }),
  ]);
  const slugs = new Map([...people, ...places].map((row) => [row.id, row.slug]));
  return claims.map((claim) => {
    const { applied } = claim;
    if (!applied) return claim;
    const slug = slugs.get(applied.id);
    const appliedHref =
      applied.type === "event"
        ? `/events/${applied.id}`
        : applied.type === "person" && slug
          ? `/people/${slug}`
          : applied.type === "place" && slug
            ? `/places/${slug}`
            : null;
    return { ...claim, appliedHref };
  });
}

export async function listClaims(
  actor: Actor,
  options: { status?: string } = {},
): Promise<{ claims: ClaimView[]; waiting: number }> {
  assertCan(actor, "write");
  const wanted = (options.status ?? "proposed").toLowerCase();
  const status = (STATUSES as readonly string[]).includes(wanted) ? wanted : "proposed";
  const db = getDb();
  const [rows, waiting] = await Promise.all([
    db.claim.findMany({
      where: { status: status.toUpperCase() as Uppercase<ClaimStatusName> },
      orderBy: status === "proposed" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      take: 200,
      include,
    }),
    db.claim.count({ where: { status: "PROPOSED" } }),
  ]);
  return { claims: await withLinks(rows.map(view)), waiting };
}

export async function getClaim(actor: Actor, id: string): Promise<ClaimView | null> {
  assertCan(actor, "write");
  if (!UUID.test(id)) return null;
  const row = await getDb().claim.findUnique({ where: { id }, include });
  return row ? (await withLinks([view(row)]))[0] : null;
}

export type ProposeErrors = Partial<
  Record<"statement" | "action" | "args" | "document" | "confidence", string>
>;

export interface ProposeInput {
  statement: string;
  action: string;
  args: unknown;
  /** Id of the document the fact was read from. */
  document?: string;
  quote?: string;
  /** Between 0 and 1: how sure the proposer is. */
  confidence?: number;
  /** Name of the model or assistant proposing, when it is not a person. */
  agent?: string;
}

const toolFor = (action: ClaimAction) => TOOLS.find((tool) => tool.name === action)!;

/** Checks a proposal's arguments against what its action takes. */
function checkArgs(action: ClaimAction, args: unknown): string | null {
  const parsed = z.object(toolFor(action).input).safeParse(args);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return `${issue.path.join(".") || "args"}: ${issue.message}`;
}

/** Puts a fact in the queue for a person to accept or reject. Changes nothing else. */
export async function proposeClaim(
  actor: Actor,
  input: ProposeInput,
): Promise<{ ok: true; id: string } | { ok: false; errors: ProposeErrors }> {
  assertCan(actor, "write");
  const errors: ProposeErrors = {};
  const statement = input.statement.trim();
  if (!statement) errors.statement = "Say the fact in plain words.";
  else if (statement.length > 500) errors.statement = "Keep the statement under 500 characters.";
  if (!isClaimAction(input.action)) {
    errors.action = "Not something that can be proposed.";
  } else {
    const problem = checkArgs(input.action, input.args);
    if (problem) errors.args = problem;
  }
  const confidence = input.confidence;
  if (confidence !== undefined && !(confidence >= 0 && confidence <= 1)) {
    errors.confidence = "Between 0 and 1.";
  }

  const db = getDb();
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
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const quote = input.quote?.trim().slice(0, MAX_QUOTE_LENGTH);
  const claim = await db.claim.create({
    data: {
      statement,
      action: input.action,
      payload: { args: input.args as object, ...(quote ? { quote } : {}) },
      confidence: confidence ?? null,
      sourceId,
      ...(actor.kind === "user"
        ? { createdByUserId: actor.userId }
        : { createdByAgent: input.agent?.trim().slice(0, 80) || "An assistant" }),
    },
    select: { id: true },
  });
  return { ok: true, id: claim.id };
}

export type DecideResult =
  | { ok: true; claim: ClaimView }
  | { ok: false; status: 404 | 409 | 422; message: string; fields?: Record<string, string> };

/** The row a successful change made or touched, for tying it to the claim's source. */
async function appliedRow(
  action: ClaimAction,
  args: Record<string, unknown>,
  body: unknown,
): Promise<{ appliedType: string; appliedId: string } | null> {
  const reply = (body ?? {}) as Record<string, { id?: string; slug?: string } | undefined>;
  const db = getDb();
  if (action === "add_event" || action === "update_event") {
    return reply.event?.id ? { appliedType: "event", appliedId: reply.event.id } : null;
  }
  if (action === "add_place" || action === "update_place") {
    const slug = reply.place?.slug;
    const place = slug
      ? await db.place.findUnique({ where: { slug }, select: { id: true } })
      : null;
    return place ? { appliedType: "place", appliedId: place.id } : null;
  }
  const slug = reply.person?.slug ?? (typeof args.slug === "string" ? args.slug : undefined);
  const person = slug
    ? await db.person.findUnique({ where: { slug }, select: { id: true } })
    : null;
  return person ? { appliedType: "person", appliedId: person.id } : null;
}

/**
 * Accepts a proposal: makes the change it describes, as the reviewer, through
 * the same route any edit takes, and records what it made. If the change is
 * refused (the person is gone, the date no longer fits) the proposal stays in
 * the queue and the reason comes back.
 */
export async function acceptClaim(actor: Actor, id: string): Promise<DecideResult> {
  assertCan(actor, "write");
  const claim = await getClaim(actor, id);
  if (!claim) return { ok: false, status: 404, message: "There is no such proposal." };
  if (claim.status !== "proposed") {
    return { ok: false, status: 409, message: `That proposal was already ${claim.status}.` };
  }
  if (!isClaimAction(claim.action)) {
    return { ok: false, status: 422, message: "This proposal asks for something unknown." };
  }
  const problem = checkArgs(claim.action, claim.args);
  if (problem)
    return { ok: false, status: 422, message: `It cannot be accepted as written: ${problem}.` };

  // Taken first, so two reviewers cannot both make the change.
  const db = getDb();
  const taken = await db.claim.updateMany({
    where: { id, status: "PROPOSED" },
    data: {
      status: "ACCEPTED",
      reviewedAt: new Date(),
      reviewedById: actor.kind === "user" ? actor.userId : null,
    },
  });
  if (taken.count === 0) {
    return { ok: false, status: 409, message: "Someone else has just decided that proposal." };
  }
  const putBack = () =>
    db.claim.update({
      where: { id },
      data: { status: "PROPOSED", reviewedAt: null, reviewedById: null },
    });

  // Loaded here, not at the top: the route table itself offers these functions.
  const { ROUTES } = await import("@/server/api/routes");
  const [method, path] = toolFor(claim.action).route.split(" ");
  const route = ROUTES.find((entry) => entry.method === method && entry.path === path)!;
  let reply;
  try {
    reply = await route.run({ actor, ...splitArguments(method, path, claim.args) });
  } catch (error) {
    await putBack();
    throw error;
  }
  if (reply.status >= 400) {
    await putBack();
    const body = reply.body as { message?: string; fields?: Record<string, string> };
    return {
      ok: false,
      status: 422,
      message: body.message ?? "The change was refused.",
      fields: body.fields,
    };
  }

  const applied = await appliedRow(claim.action, claim.args, reply.body);
  if (applied) await db.claim.update({ where: { id }, data: applied });
  return { ok: true, claim: (await getClaim(actor, id))! };
}

/** Rejects a proposal, with an optional word on why. Nothing else changes. */
export async function rejectClaim(actor: Actor, id: string, note?: string): Promise<DecideResult> {
  assertCan(actor, "write");
  const claim = await getClaim(actor, id);
  if (!claim) return { ok: false, status: 404, message: "There is no such proposal." };
  if (claim.status !== "proposed") {
    return { ok: false, status: 409, message: `That proposal was already ${claim.status}.` };
  }
  await getDb().claim.updateMany({
    where: { id, status: "PROPOSED" },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewedById: actor.kind === "user" ? actor.userId : null,
      reviewNote: note?.trim().slice(0, 500) || null,
    },
  });
  return { ok: true, claim: (await getClaim(actor, id))! };
}
