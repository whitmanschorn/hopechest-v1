/**
 * Reading facts out of what someone wrote: what the model is told, what it is
 * given, and how its answer is checked before anything is proposed. Pure.
 */
import { isClaimAction, MAX_QUOTE_LENGTH } from "../claims/actions";

export const SYSTEM_PROMPT = `You help a family keep its history. You are given a page of prose a family member wrote about one person, what is already recorded about that person, and the list of people in the family's records.

Find facts that the text states plainly and that are not already recorded. Only these kinds:
- A birth or death date, a family name at birth, or a nickname of the person the page is about: action "update_person", args { "slug": <their slug>, and any of "born", "died", "birthFamilyName", "nicknames" (a list) }.
- A dated event in the person's life (marriage, divorce, move, immigration, military, education, work, other): action "add_event", args { "kind", "title", "date", "participants": [{ "person": <slug> }] }. Every participant must be a slug from the list of people. A marriage or divorce needs exactly two participants.

Rules:
- Dates are text as written: "1931", "June 1931", "1931-06-04", "around 1931". Never invent or narrow a date.
- "quote" is the sentence from the text that states the fact, copied exactly.
- Skip anything uncertain, hearsay ("some say"), or about people not in the list.
- Skip anything already recorded with the same value.
- If the text contradicts what is recorded, still report it, and say so in the statement.

Answer with JSON only: { "facts": [ { "statement": <the fact in plain words>, "action": ..., "args": {...}, "quote": ..., "confidence": <0 to 1> } ] }. If there is nothing, answer { "facts": [] }.`;

export interface ExtractionInput {
  person: { slug: string; name: string };
  /** What the record already holds about them. */
  recorded: {
    born: string | null;
    died: string | null;
    birthFamilyName: string | null;
    nicknames: string[];
    events: { kind: string; title: string; date: string | null; people: string[] }[];
  };
  /** Everyone a fact may name. */
  people: { slug: string; name: string }[];
  text: string;
}

/** The longest text handed to the model in one go. */
export const MAX_TEXT_FOR_MODEL = 24_000;

export function buildUserMessage(input: ExtractionInput): string {
  return JSON.stringify({ ...input, text: input.text.slice(0, MAX_TEXT_FOR_MODEL) });
}

export interface FoundFact {
  statement: string;
  action: "update_person" | "add_event";
  args: Record<string, unknown>;
  quote: string;
  confidence: number | null;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

const PERSON_FIELDS = new Set(["slug", "born", "died", "birthFamilyName", "nicknames"]);

/**
 * The facts in a model's answer that can be trusted as far as a program can
 * tell: well-formed, about the right person, naming only people who exist,
 * and resting on words that really are in the text. Everything else is dropped.
 */
export function readFacts(answer: unknown, input: ExtractionInput): FoundFact[] {
  const list = (answer as { facts?: unknown } | null)?.facts;
  if (!Array.isArray(list)) return [];
  const known = new Set(input.people.map((person) => person.slug));
  const text = squash(input.text);
  const facts: FoundFact[] = [];
  for (const entry of list.slice(0, 20)) {
    if (entry === null || typeof entry !== "object") continue;
    const { statement, action, args, quote, confidence } = entry as Record<string, unknown>;
    if (typeof statement !== "string" || !statement.trim()) continue;
    if (typeof action !== "string" || !isClaimAction(action)) continue;
    if (args === null || typeof args !== "object" || Array.isArray(args)) continue;
    // A fact must rest on words that are really there.
    if (typeof quote !== "string" || squash(quote).length < 8 || !text.includes(squash(quote))) {
      continue;
    }
    const given = args as Record<string, unknown>;
    if (action === "update_person") {
      if (given.slug !== input.person.slug) continue;
      const fields = Object.keys(given).filter((key) => key !== "slug");
      if (fields.length === 0 || fields.some((key) => !PERSON_FIELDS.has(key))) continue;
    } else if (action === "add_event") {
      const participants = Array.isArray(given.participants) ? given.participants : [];
      const slugs = participants.map((p) => (p as { person?: unknown } | null)?.person);
      if (
        slugs.length === 0 ||
        slugs.some((slug) => typeof slug !== "string" || !known.has(slug))
      ) {
        continue;
      }
      if (!slugs.includes(input.person.slug)) continue;
    } else continue;
    facts.push({
      statement: statement.trim().slice(0, 500),
      action,
      args: given,
      quote: quote.trim().slice(0, MAX_QUOTE_LENGTH),
      confidence:
        typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : null,
    });
  }
  return facts;
}

/** A stable spelling of a proposal's arguments, to tell whether it was made before. */
export function argsKey(action: string, args: unknown): string {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, inner]) => [key, sorted(inner)]),
          )
        : value;
  return `${action}:${JSON.stringify(sorted(args))}`;
}
