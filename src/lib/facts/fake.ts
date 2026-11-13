/**
 * A stand-in for the language model, for tests and for working without a key.
 * It reads a few fixed sentence shapes and nothing else, which is enough to
 * exercise everything around the model: the checks, the queue, the page.
 */
import type { ExtractionInput } from "./prompt";

const DATE = String.raw`((?:around |about |c\. )?(?:(?:January|February|March|April|May|June|July|August|September|October|November|December) (?:\d{1,2}, )?)?\d{4})`;

export function fakeExtract(input: ExtractionInput): { facts: unknown[] } {
  const facts: unknown[] = [];
  const who = input.person;
  const bySlug = new Map(input.people.map((person) => [person.slug, person]));
  const byName = new Map(input.people.map((person) => [person.name.toLowerCase(), person]));
  for (const sentence of input.text.split(/(?<=[.!?])\s+|\n+/)) {
    const born = new RegExp(String.raw`\bborn (?:on |in )?${DATE}`, "i").exec(sentence);
    if (born) {
      facts.push({
        statement: `${who.name} was born in ${born[1]}`,
        action: "update_person",
        args: { slug: who.slug, born: born[1] },
        quote: sentence.trim(),
        confidence: 0.9,
      });
    }
    const died = new RegExp(String.raw`\bdied (?:on |in )?${DATE}`, "i").exec(sentence);
    if (died) {
      facts.push({
        statement: `${who.name} died in ${died[1]}`,
        action: "update_person",
        args: { slug: who.slug, died: died[1] },
        quote: sentence.trim(),
        confidence: 0.9,
      });
    }
    const married = new RegExp(
      String.raw`\bmarried \[\[([^\]|]+)(?:\|[^\]]+)?\]\] in ${DATE}`,
      "i",
    ).exec(sentence);
    if (married) {
      const target = married[1].trim();
      const other = bySlug.get(target) ?? byName.get(target.toLowerCase());
      facts.push({
        statement: `${who.name} married ${other?.name ?? target} in ${married[2]}`,
        action: "add_event",
        args: {
          kind: "marriage",
          title: `${who.name} and ${other?.name ?? target} marry`,
          date: married[2],
          // An unknown name is passed through, to show that the checks drop it.
          participants: [{ person: who.slug }, { person: other?.slug ?? target }],
        },
        quote: sentence.trim(),
        confidence: 0.8,
      });
    }
  }
  // Something no text supports, to show that the checks drop it too.
  if (/\bmoon\b/i.test(input.text)) {
    facts.push({
      statement: `${who.name} walked on the moon`,
      action: "update_person",
      args: { slug: who.slug, died: "1969" },
      quote: "These words are not in the text at all.",
      confidence: 1,
    });
  }
  return { facts };
}
