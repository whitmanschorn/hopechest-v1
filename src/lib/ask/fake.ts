/**
 * A stand-in for the language model when answering questions, for tests and
 * for working without a key. It follows one fixed plan (who is meant, then
 * their marriage, their record, or a search of the documents), which is
 * enough to exercise everything around the model: the lookups, the citation
 * checks, the conversation and the page. Pure.
 */
import type { ChatMessage, ChatReply, ToolCall } from "./chat";

const KIN =
  /\b(mom|mother|dad|father|parents?|grandma|grandmother|grandpa|grandfather|grandparents|aunt|uncle|cousins?|brother|sister|wife|husband|my)\b/i;
const MARRIAGE = /\b(marri|wed)/i;

interface Named {
  slug: string;
  displayName: string;
}

const call = (name: string, args: Record<string, unknown>): ToolCall => ({
  id: `fake-${name}-${Math.random().toString(36).slice(2, 8)}`,
  name,
  arguments: args,
});

const keywords = (question: string) =>
  question
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .join(" ");

const parse = (message: ChatMessage | undefined): Record<string, unknown> => {
  try {
    return JSON.parse(message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
};

export function fakeChat(messages: readonly ChatMessage[]): ChatReply {
  const lastUser = messages.findLastIndex((message) => message.role === "user");
  const question = messages[lastUser]?.content ?? "";
  const asker = /\(slug: ([a-z0-9-]+)\)/.exec(messages[0]?.content ?? "")?.[1];
  // What each round of lookups brought back.
  const rounds: Record<string, unknown>[][] = [];
  for (const message of messages.slice(lastUser + 1)) {
    if (message.role === "assistant") rounds.push([]);
    else if (message.role === "tool") rounds.at(-1)?.push(parse(message));
  }
  const say = (content: string): ChatReply => ({ content, toolCalls: [] });
  const ask = (...toolCalls: ToolCall[]): ChatReply => ({ content: "", toolCalls });

  // Round one: who is the question about? Family words, or names (capitalised
  // words after the first).
  if (rounds.length === 0) {
    if (asker && KIN.test(question)) {
      return ask(call("resolve_kin", { person: asker, words: question }));
    }
    const names = question
      .split(/\s+/)
      .slice(1)
      .map((word) => word.replace(/[^\p{L}]/gu, ""))
      .filter((word) => /^\p{Lu}\p{Ll}{2,}$/u.test(word));
    return names.length > 0
      ? ask(...names.slice(0, 2).map((name) => call("find_people", { q: name })))
      : ask(call("search_documents", { q: keywords(question) }));
  }

  const meant: Named[] = [];
  for (const result of rounds[0]) {
    const found = Array.isArray(result.kin)
      ? (result.kin as { people: Named[] }[]).flatMap((entry) => entry.people)
      : // A search by name: the closest match is first.
        ((result.people ?? []) as Named[]).slice(0, 1);
    for (const person of found) {
      if (!meant.some((entry) => entry.slug === person.slug)) meant.push(person);
    }
  }
  const documents = rounds.flat().find((result) => Array.isArray(result.documents));

  // Round two: their marriage, their record, or the documents.
  if (rounds.length === 1 && !documents) {
    if (meant.length > 0 && MARRIAGE.test(question)) {
      return ask(call("list_events", { kind: "marriage", person: meant[0].slug }));
    }
    if (meant.length > 0) return ask(call("get_person", { slug: meant[0].slug }));
    return ask(call("search_documents", { q: keywords(question) }));
  }

  const second = rounds[1]?.[0] ?? {};
  if (Array.isArray(second.events)) {
    const events = second.events as {
      id: string;
      date: { display: string } | null;
      participants: Named[];
    }[];
    const theirs = events.find((event) =>
      meant.every((person) => event.participants.some((entry) => entry.slug === person.slug)),
    );
    const names = meant.map((person) => person.displayName).join(" and ");
    if (!theirs) return say(`No marriage is recorded for ${names}.`);
    const people = meant.map((person) => `[person:${person.slug}]`).join(" ");
    return say(
      theirs.date
        ? `${names} were married on ${theirs.date.display}. [event:${theirs.id}] ${people} [document:never-looked-up]`
        : `${names} married, but no date is recorded. [event:${theirs.id}]`,
    );
  }
  if (second.person) {
    const person = second.person as Named & { values?: { born?: { display: string } | null } };
    const born = person.values?.born;
    return say(
      born
        ? `${person.displayName} was born on ${born.display}. [person:${person.slug}]`
        : `${person.displayName} is in the chest, but no date of birth is recorded. [person:${person.slug}]`,
    );
  }
  const hit = ((documents?.documents ?? []) as { id: string; title: string }[])[0];
  return say(
    hit
      ? `The closest thing in the chest is **${hit.title}**. [document:${hit.id}]`
      : "Nothing in the chest mentions that, so it is not recorded.",
  );
}
