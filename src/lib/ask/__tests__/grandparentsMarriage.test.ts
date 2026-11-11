/**
 * "When did grandma and grandpa get married?", answered from the Bluth seed
 * without a language model: the family words are resolved for the person
 * asking, the marriage of those two people is found, and its date is checked
 * against the document it cites. Ask is built on exactly these steps.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe as describeDate } from "@/lib/fuzzyDate";
import { buildGraph, type KinLink } from "@/lib/kinship";
import {
  parseSeedDocument,
  resolveDate,
  type SeedEvent,
  type SeedPerson,
  type SeedRelationship,
} from "../../../../scripts/lib/seedData";
import { findKin, resolveKinWord } from "../kinTerms";

const dir = join("seed", "bluth");
const read = <T>(name: string) => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
const people = read<SeedPerson[]>("people.json");
const relationships = read<SeedRelationship[]>("relationships.json");
const events = read<SeedEvent[]>("events.json");

// The seed's slugs stand in for database ids.
const graph = buildGraph(
  people.map((person) => ({ id: person.slug, gender: person.gender ?? null })),
  relationships.map((rel): KinLink =>
    rel.type === "parent"
      ? { type: "parent", parentId: rel.from, childId: rel.to }
      : {
          type: "partner",
          aId: rel.from,
          bId: rel.to,
          married: rel.qualifier === "married",
          current: !rel.endReason || rel.endReason === "death",
        },
  ),
);

function marriageOf(a: string, b: string): SeedEvent | undefined {
  return events.find((event) => {
    const subjects = event.participants
      .filter((p) => (p.role ?? "subject") === "subject")
      .map((p) => p.person);
    return event.kind === "marriage" && subjects.includes(a) && subjects.includes(b);
  });
}

const QUESTION = "When did grandma and grandpa get married?";

describe(`"${QUESTION}"`, () => {
  it("means George Sr. and Lucille when George Michael asks", () => {
    expect(findKin(graph, "george-michael", QUESTION)).toEqual([
      { word: "grandma", people: ["lucille"] },
      { word: "grandpa", people: ["george-sr"] },
    ]);
  });

  it("is ambiguous for Maeby, who has two grandmothers on record", () => {
    // Lucille adopted Maeby's mother; Mimi gave birth to her. Ask must say which it means.
    const [grandma, grandpa] = findKin(graph, "maeby", QUESTION).map((mention) =>
      mention.people.sort(),
    );
    expect(grandma).toEqual(["lucille", "mimi"]);
    expect(grandpa).toEqual(["george-sr"]);
  });

  it("has no answer for Mimi, whose grandparents are not in the record", () => {
    // The right reply is "not recorded", never a guess.
    expect(findKin(graph, "mimi", QUESTION).map((mention) => mention.people)).toEqual([[], []]);
  });

  it("is answered by their marriage licence: February 13, 1965", () => {
    const [grandma, grandpa] = findKin(graph, "george-michael", QUESTION).map(
      (mention) => mention.people[0],
    );
    const wedding = marriageOf(grandma, grandpa);
    expect(wedding).toBeDefined();

    const date = resolveDate(wedding!.date)!;
    expect(date).toMatchObject({ year: 1965, month: 2, day: 13, precision: "day" });
    expect(date.deduced).toBeUndefined();
    // Said plainly, with no "around" or "probably".
    expect(describeDate(date)).toBe("February 13, 1965");
  });

  it("cites a document that really says so", () => {
    const wedding = marriageOf("lucille", "george-sr")!;
    expect(wedding.sources).toEqual(["marriage-license-george-lucille"]);

    const licence = parseSeedDocument(
      wedding.sources![0],
      readFileSync(join(dir, "documents", `${wedding.sources![0]}.md`), "utf8"),
    );
    expect(licence.kind).toBe("record");
    expect(licence.text).toContain("GEORGE OSCAR BLUTH");
    expect(licence.text).toContain("LUCILLE JENKINS");
    expect(licence.text).toContain("joined by me in marriage");
    expect(licence.text).toContain("on the 13th day of February, 1965");
    // The licence's own date and the event's date are the same day.
    expect(resolveDate(licence.date)).toMatchObject({ year: 1965, month: 2, day: 13 });
  });
});

describe("family words", () => {
  const who = (asker: string, word: string) => resolveKinWord(graph, asker, word).sort();

  it("depend on who is asking", () => {
    expect(who("george-michael", "dad")).toEqual(["michael"]);
    expect(who("maeby", "dad")).toEqual(["tobias"]);
    expect(who("michael", "mom")).toEqual(["lucille"]);
    expect(who("michael", "son")).toEqual(["george-michael"]);
    expect(who("michael", "brothers")).toEqual(["annyong", "buster", "gob"]);
    // Tobias is an uncle by marriage.
    expect(who("george-michael", "uncle")).toEqual(["annyong", "buster", "gob", "tobias"]);
    expect(who("george-michael", "great-grandma")).toEqual(["mimi"]);
  });

  it("finds two fathers for Buster", () => {
    expect(who("buster", "father")).toEqual(["george-sr", "oscar"]);
  });

  it("keeps a great-grandmother apart from a grandmother", () => {
    expect(findKin(graph, "george-michael", "Was great-grandma older than grandma?")).toEqual([
      { word: "great-grandma", people: ["mimi"] },
      { word: "grandma", people: ["lucille"] },
    ]);
  });

  it("ignores words that only look like family words", () => {
    expect(
      findKin(graph, "michael", "Who sang the song about the sun and the grandstand?"),
    ).toEqual([]);
    expect(resolveKinWord(graph, "michael", "banana")).toEqual([]);
  });
});
