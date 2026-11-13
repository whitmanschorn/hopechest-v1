import { getDb } from "@/lib/db";
import { describe } from "@/lib/fuzzyDate";
import {
  argsKey,
  buildUserMessage,
  readFacts,
  SYSTEM_PROMPT,
  type ExtractionInput,
} from "@/lib/facts/prompt";
import { assertCan, type Actor } from "@/server/actor";
import { proposeClaim } from "@/server/claims/service";
import { getLlm } from "@/server/llm";
import { getPerson } from "@/server/people/service";
import { getArticle } from "@/server/wiki/service";

export type SuggestResult =
  { ok: true; proposed: number; message: string } | { ok: false; message: string };

/** The address a person's wiki page is cited by, as a source of facts. */
export const pageSourceUrl = (slug: string) => `/people/${slug}`;

/**
 * Reads a person's wiki page for facts that are not in the record yet and
 * puts each in the proposed-facts queue, with the page as its source and the
 * sentence it came from. Nothing is recorded: a person accepts or rejects.
 * A fact proposed before (waiting, accepted or rejected) is not proposed again.
 */
export async function suggestFromPersonPage(actor: Actor, slug: string): Promise<SuggestResult> {
  assertCan(actor, "write");
  const llm = getLlm();
  if (!llm) return { ok: false, message: "Reading facts from pages is not set up here." };
  const [person, article] = await Promise.all([
    getPerson(actor, slug),
    getArticle(actor, { kind: "person", slug }),
  ]);
  if (!person || !article?.exists || !article.body.trim()) {
    return { ok: false, message: "There is nothing written to read yet." };
  }

  const db = getDb();
  const people = await db.person.findMany({ select: { slug: true, displayName: true } });
  const input: ExtractionInput = {
    person: { slug: person.slug, name: person.displayName },
    recorded: {
      born: person.values.born ? describe(person.values.born) : null,
      died: person.values.died ? describe(person.values.died) : null,
      birthFamilyName: person.values.birthFamilyName,
      nicknames: person.values.nicknames,
      events: person.events.map((event) => ({
        kind: event.kind,
        title: event.title,
        date: event.date ? describe(event.date) : null,
        people: event.with.map((other) => other.slug),
      })),
    },
    people: people.map((entry) => ({ slug: entry.slug, name: entry.displayName })),
    text: article.body,
  };

  let answer: unknown;
  try {
    answer = await llm.json({ system: SYSTEM_PROMPT, user: buildUserMessage(input) });
  } catch (error) {
    console.error("Reading facts failed", slug, error);
    return {
      ok: false,
      message: "The page could not be read for facts just now. Try again later.",
    };
  }
  const facts = readFacts(answer, input);

  const url = pageSourceUrl(person.slug);
  const before = await db.claim.findMany({
    where: { source: { url } },
    select: { action: true, payload: true },
  });
  const seen = new Set(
    before.map((claim) =>
      argsKey(claim.action, (claim.payload as { args?: unknown } | null)?.args),
    ),
  );
  let proposed = 0;
  for (const fact of facts) {
    const key = argsKey(fact.action, fact.args);
    if (seen.has(key)) continue;
    seen.add(key);
    const result = await proposeClaim(actor, {
      statement: fact.statement,
      action: fact.action,
      args: fact.args,
      quote: fact.quote,
      confidence: fact.confidence ?? undefined,
      agent: llm.name,
      page: { url, citation: `${person.displayName}’s page in the wiki` },
    });
    if (result.ok) proposed++;
  }
  return {
    ok: true,
    proposed,
    message:
      proposed === 0
        ? "Nothing new to record was found in this page."
        : proposed === 1
          ? "Found 1 thing that could be recorded."
          : `Found ${proposed} things that could be recorded.`,
  };
}
