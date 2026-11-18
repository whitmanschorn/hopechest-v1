import { z } from "zod";
import { splitArguments } from "@/lib/api/match";
import type { ChatMessage, ChatTool } from "@/lib/ask/chat";
import { readAnswer, renumber, type Ref } from "@/lib/ask/cite";
import {
  ASK_TOOLS,
  MAX_QUESTION_LENGTH,
  MAX_RESULT_LENGTH,
  MAX_ROUNDS,
  stepLabel,
  systemPrompt,
  type Asker,
} from "@/lib/ask/prompt";
import { getChestConfig } from "@/lib/chest";
import { getDb } from "@/lib/db";
import { assertCan, type Actor } from "@/server/actor";
import { getLlm } from "@/server/llm";
import { TOOLS } from "@/server/mcp/tools";

export interface Citation {
  /** The number it carries in the answer's text: "[1]". */
  number: number;
  type: Ref["type"];
  id: string;
  label: string;
  href: string;
}

export interface Answer {
  text: string;
  citations: Citation[];
  /** The lookups made on the way, in words. */
  steps: string[];
  /** Set when the question was kept as part of a conversation. */
  conversationId: string | null;
  model: string;
}

export type AskResult =
  { ok: true; answer: Answer } | { ok: false; status: 404 | 422 | 429 | 503; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Questions one member may ask in an hour; the model costs money per question. */
const HOURLY_LIMIT = 40;
/** Earlier turns the model is shown, so "and her sister?" makes sense. */
const HISTORY = 8;

const askTools = TOOLS.filter((tool) => (ASK_TOOLS as readonly string[]).includes(tool.name));

/** The lookups as the model is told about them. */
function toolList(): ChatTool[] {
  return askTools.map((tool) => {
    const parameters = z.toJSONSchema(z.object(tool.input)) as Record<string, unknown>;
    delete parameters.$schema;
    return { name: tool.name, description: tool.description, parameters };
  });
}

/** Makes one lookup as the person asking, through the same route the API and MCP use. */
async function lookUp(actor: Actor, name: string, args: Record<string, unknown>): Promise<string> {
  const tool = askTools.find((entry) => entry.name === name);
  if (!tool) return JSON.stringify({ error: `There is no lookup called ${name}.` });
  // Loaded here because the route table itself offers Ask as a route.
  const { ROUTES } = await import("@/server/api/routes");
  const [method, path] = tool.route.split(" ");
  const route = ROUTES.find((entry) => entry.method === method && entry.path === path);
  if (!route || route.method !== "GET")
    return JSON.stringify({ error: "That lookup is not available." });
  try {
    const reply = await route.run({ actor, ...splitArguments(method, path, args) });
    const text = JSON.stringify(reply.body);
    return text.length > MAX_RESULT_LENGTH
      ? `${text.slice(0, MAX_RESULT_LENGTH)}… (cut short; ask for something narrower)`
      : text;
  } catch (error) {
    console.error("Ask lookup failed", name, error);
    return JSON.stringify({ error: "That lookup failed." });
  }
}

/** Finds what each citation points at; ones that point at nothing are dropped. */
async function label(refs: Ref[]): Promise<(Omit<Citation, "number"> | null)[]> {
  const db = getDb();
  const ids = (type: Ref["type"]) => refs.filter((ref) => ref.type === type).map((ref) => ref.id);
  const uuids = (type: Ref["type"]) => ids(type).filter((id) => UUID.test(id));
  const [people, places, pages, events, documents, photos] = await Promise.all([
    db.person.findMany({
      where: { slug: { in: ids("person") } },
      select: { slug: true, displayName: true },
    }),
    db.place.findMany({
      where: { slug: { in: ids("place") } },
      select: { slug: true, label: true },
    }),
    db.article.findMany({
      where: { slug: { in: ids("page") }, personId: null },
      select: { slug: true, title: true },
    }),
    db.event.findMany({ where: { id: { in: uuids("event") } }, select: { id: true, title: true } }),
    db.document.findMany({
      where: { id: { in: uuids("document") }, status: "PUBLISHED" },
      select: { id: true, title: true },
    }),
    db.photo.findMany({
      where: { id: { in: uuids("photo") }, status: "PUBLISHED" },
      select: { id: true, caption: true },
    }),
  ]);
  return refs.map((ref) => {
    const found = (labelText: string | null | undefined, href: string) =>
      labelText === undefined ? null : { ...ref, label: labelText || "Untitled", href };
    switch (ref.type) {
      case "person":
        return found(people.find((p) => p.slug === ref.id)?.displayName, `/people/${ref.id}`);
      case "place":
        return found(places.find((p) => p.slug === ref.id)?.label, `/places/${ref.id}`);
      case "page":
        return found(pages.find((p) => p.slug === ref.id)?.title, `/wiki/${ref.id}`);
      case "event":
        return found(events.find((e) => e.id === ref.id)?.title, `/events/${ref.id}`);
      case "document":
        return found(documents.find((d) => d.id === ref.id)?.title, `/documents/${ref.id}`);
      case "photo": {
        const photo = photos.find((p) => p.id === ref.id);
        return found(photo ? photo.caption || "A photo" : undefined, `/photos/${ref.id}`);
      }
    }
  });
}

/**
 * Answers a question from the chest. The model may only look things up, with
 * the asker's own permissions; what it cites is checked against what those
 * lookups returned. A member's questions are kept as a conversation.
 */
export async function ask(
  actor: Actor,
  input: { question: string; conversationId?: string; as?: string },
  onStep: (step: string) => void = () => undefined,
): Promise<AskResult> {
  assertCan(actor, "read");
  const llm = getLlm();
  if (!llm) return { ok: false, status: 503, message: "This chest has no language model set up." };
  const question = input.question.trim();
  if (!question) return { ok: false, status: 422, message: "Ask a question." };
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      status: 422,
      message: `Keep the question under ${MAX_QUESTION_LENGTH} characters.`,
    };
  }

  const db = getDb();
  const chest = getChestConfig();
  // Whose "my" it is: the member asking, or for a program whoever it names.
  let asker: Asker | null = null;
  if (actor.kind === "user" ? actor.personId : input.as) {
    const person = await db.person.findFirst({
      where: actor.kind === "user" ? { id: actor.personId! } : { slug: input.as },
      select: { slug: true, displayName: true },
    });
    if (!person && actor.kind !== "user") {
      return {
        ok: false,
        status: 422,
        message: `Nobody in the chest has the address "${input.as}".`,
      };
    }
    asker = person && { slug: person.slug, name: person.displayName };
  }

  let conversationId: string | null = null;
  const earlier: ChatMessage[] = [];
  if (actor.kind === "user") {
    const recent = await db.message.count({
      where: {
        role: "USER",
        conversation: { userId: actor.userId },
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (recent >= HOURLY_LIMIT) {
      return {
        ok: false,
        status: 429,
        message: "That is a lot of questions for one hour. Try again a little later.",
      };
    }
    if (input.conversationId) {
      const conversation = UUID.test(input.conversationId)
        ? await db.conversation.findFirst({
            where: { id: input.conversationId, userId: actor.userId },
            select: {
              id: true,
              messages: {
                where: { role: { in: ["USER", "ASSISTANT"] } },
                orderBy: { createdAt: "desc" },
                take: HISTORY,
                select: { role: true, content: true },
              },
            },
          })
        : null;
      if (!conversation) return { ok: false, status: 404, message: "That conversation is gone." };
      conversationId = conversation.id;
      for (const message of conversation.messages.reverse()) {
        earlier.push({
          role: message.role === "USER" ? "user" : "assistant",
          content: message.content,
        });
      }
    }
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt({
        chest: chest.name,
        asker,
        today: new Date().toISOString().slice(0, 10),
        sample: chest.env !== "production",
      }),
    },
    ...earlier,
    { role: "user", content: question },
  ];
  const tools = toolList();
  const results: string[] = [];
  const steps: string[] = [];
  const calls: { name: string; arguments: Record<string, unknown> }[] = [];
  let said = "";
  try {
    for (let round = 0; ; round += 1) {
      // Out of rounds: no more lookups are offered, so it must answer.
      const last = round >= MAX_ROUNDS;
      const reply = await llm.chat({ messages, tools: last ? [] : tools });
      if (reply.toolCalls.length === 0 || last) {
        said = reply.content;
        break;
      }
      messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
      for (const call of reply.toolCalls) {
        const step = stepLabel(call.name, call.arguments);
        steps.push(step);
        onStep(step);
        calls.push({ name: call.name, arguments: call.arguments });
        const result = await lookUp(actor, call.name, call.arguments);
        results.push(result);
        messages.push({ role: "tool", content: result, toolCallId: call.id });
      }
    }
  } catch (error) {
    console.error("Ask failed", error);
    return {
      ok: false,
      status: 503,
      message: "The answer could not be worked out just now. Try again in a moment.",
    };
  }

  const read = readAnswer(said, results);
  const labelled = await label(read.refs);
  const citations = labelled
    .filter((entry) => entry !== null)
    .map((entry, index) => ({ number: index + 1, ...entry }));
  const text =
    renumber(
      read.text,
      labelled.map((entry) => entry !== null),
    ) || "I could not find an answer to that in the chest.";

  if (actor.kind === "user") {
    const userId = actor.userId;
    conversationId = await db.$transaction(async (tx) => {
      const id =
        conversationId ??
        (await tx.conversation.create({ data: { userId, title: question.slice(0, 80) } })).id;
      await tx.message.create({ data: { conversationId: id, role: "USER", content: question } });
      await tx.message.create({
        data: {
          conversationId: id,
          role: "ASSISTANT",
          content: text,
          citations: citations as object[],
          toolCalls: { model: llm.name, steps, calls } as object,
        },
      });
      await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return id;
    });
  }
  return { ok: true, answer: { text, citations, steps, conversationId, model: llm.name } };
}

// ── conversations: a member's own, and nobody else's ──

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations: Citation[];
  steps: string[];
}

export async function listConversations(actor: Actor): Promise<ConversationSummary[]> {
  assertCan(actor, "read");
  if (actor.kind !== "user") return [];
  const rows = await getDb().conversation.findMany({
    where: { userId: actor.userId },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });
  return rows.map((row) => ({ ...row, title: row.title || "A question" }));
}

export async function getConversation(
  actor: Actor,
  id: string,
): Promise<(ConversationSummary & { turns: Turn[] }) | null> {
  assertCan(actor, "read");
  if (actor.kind !== "user" || !UUID.test(id)) return null;
  const row = await getDb().conversation.findFirst({
    where: { id, userId: actor.userId },
    include: {
      messages: {
        where: { role: { in: ["USER", "ASSISTANT"] } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title || "A question",
    updatedAt: row.updatedAt,
    turns: row.messages.map((message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      text: message.content,
      citations: (message.citations as Citation[] | null) ?? [],
      steps: (message.toolCalls as { steps?: string[] } | null)?.steps ?? [],
    })),
  };
}

export async function deleteConversation(actor: Actor, id: string): Promise<boolean> {
  assertCan(actor, "read");
  if (actor.kind !== "user" || !UUID.test(id)) return false;
  const { count } = await getDb().conversation.deleteMany({ where: { id, userId: actor.userId } });
  return count > 0;
}

/** The model that answers here, by name, or null when the chest has none. */
export function askModel(): string | null {
  return getLlm()?.name ?? null;
}
