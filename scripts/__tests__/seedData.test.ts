import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chunkMarkdown,
  parseSeedDocument,
  resolveDate,
  validateSeed,
  type SeedData,
} from "../lib/seedData";

function tiny(): SeedData {
  return {
    people: [
      { slug: "ann", displayName: "Ann" },
      { slug: "bo", displayName: "Bo" },
      { slug: "cy", displayName: "Cy" },
    ],
    relationships: [
      { type: "partner", from: "ann", to: "bo", qualifier: "married" },
      { type: "parent", from: "ann", to: "cy", qualifier: "biological" },
    ],
    places: [{ slug: "home", label: "Home", lat: 33.6, lng: -117.9 }],
    events: [
      {
        slug: "ann-born",
        kind: "birth",
        title: "Ann born",
        date: "1940",
        participants: [{ person: "ann" }],
      },
      {
        slug: "cy-born",
        kind: "birth",
        title: "Cy born",
        date: "1965-05-04",
        participants: [{ person: "cy" }],
      },
      {
        slug: "wedding",
        kind: "marriage",
        title: "Ann and Bo marry",
        place: "home",
        date: { value: "c. 1964", deduced: true, clue: "Cy was born in 1965" },
        participants: [{ person: "ann" }, { person: "bo" }],
      },
    ],
    documents: [],
  };
}

describe("validateSeed", () => {
  it("accepts a consistent seed", () => {
    expect(validateSeed(tiny())).toEqual([]);
  });

  it("reports references to people and places that do not exist", () => {
    const data = tiny();
    data.relationships.push({ type: "parent", from: "bo", to: "dee", qualifier: "adoptive" });
    data.events[2].place = "church";
    expect(validateSeed(data)).toEqual([
      'parent bo -> dee: no person "dee"',
      'event "wedding": no place "church"',
    ]);
  });

  it("rejects a qualifier that does not fit the relationship", () => {
    const data = tiny();
    data.relationships[1].qualifier = "married";
    expect(validateSeed(data)).toEqual([
      'parent ann -> cy: qualifier "married" does not fit a parent',
    ]);
  });

  it("treats a couple listed in both directions as one relationship", () => {
    const data = tiny();
    data.relationships.push({ type: "partner", from: "bo", to: "ann", qualifier: "married" });
    expect(validateSeed(data)).toEqual(["relationship partner:ann+bo:married is listed twice"]);
  });

  it("allows two fathers when they are qualified differently", () => {
    const data = tiny();
    data.relationships.push(
      { type: "parent", from: "bo", to: "cy", qualifier: "legal" },
      { type: "parent", from: "bo", to: "cy", qualifier: "biological" },
    );
    expect(validateSeed(data)).toEqual([]);
  });

  it("requires a clue for a deduced date", () => {
    const data = tiny();
    data.events[2].date = { value: "c. 1964", deduced: true };
    expect(validateSeed(data)).toEqual([
      'event "wedding": a deduced date must say what it rests on (clue)',
    ]);
  });

  it("requires two people for a marriage and one for a birth", () => {
    const data = tiny();
    data.events[2].participants.pop();
    data.events[1].participants.push({ person: "bo" });
    expect(validateSeed(data)).toEqual([
      'event "cy-born": a birth has exactly one subject',
      'event "wedding": a marriage has exactly two subjects',
    ]);
  });

  it("catches a parent younger than their child and a second birth", () => {
    const data = tiny();
    data.events[0].date = "1970";
    data.events.push({
      slug: "cy-born-again",
      kind: "birth",
      title: "x",
      participants: [{ person: "cy" }],
    });
    expect(validateSeed(data)).toEqual([
      'event "cy-born-again": "cy" already has a birth',
      'parent "ann" is not older than child "cy"',
    ]);
  });
});

describe("seed users", () => {
  it("accepts fictional numbers tied to people", () => {
    const data = {
      ...tiny(),
      users: [{ phone: "+12025550101", role: "admin" as const, person: "ann" }],
    };
    expect(validateSeed(data)).toEqual([]);
  });

  it("rejects real-looking numbers, unknown people and shared people", () => {
    const data = {
      ...tiny(),
      users: [
        { phone: "+14155551234", role: "admin" as const, person: "ann" },
        { phone: "+12025550102", role: "viewer" as const, person: "ann" },
        { phone: "+12025550103", role: "viewer" as const, person: "zed" },
      ],
    };
    expect(validateSeed(data)).toEqual([
      'user "+14155551234": seed accounts must use a fictional 555-01xx number',
      'user "+12025550103": no person "zed"',
      'two users claim the person "ann"',
    ]);
  });
});

describe("resolveDate", () => {
  it("keeps the deduction and its clue", () => {
    expect(resolveDate({ value: "c. 1964", deduced: true, clue: "first child born 1965" })).toEqual(
      {
        year: 1964,
        precision: "circa",
        display: "circa 1964",
        deduced: true,
        clue: "first child born 1965",
      },
    );
  });

  it("reads a plain string", () => {
    expect(resolveDate("1965-05-04")?.display).toBe("May 4, 1965");
    expect(resolveDate(undefined)).toBeNull();
  });
});

describe("parseSeedDocument", () => {
  it("separates the header from the text", () => {
    const doc = parseSeedDocument(
      "oscar",
      '---\ntitle: Oscar Bluth\nsource_url: "https://example.org/Oscar"\nlicense: "CC-BY-SA 3.0"\n---\n\nTwin.\n',
    );
    expect(doc).toEqual({
      slug: "oscar",
      title: "Oscar Bluth",
      sourceUrl: "https://example.org/Oscar",
      license: "CC-BY-SA 3.0",
      text: "Twin.",
    });
  });
});

describe("chunkMarkdown", () => {
  it("makes one passage per section, under its heading", () => {
    expect(chunkMarkdown("Intro.\n\n## About\nFirst.\n\nSecond.\n\n### Later\nThird.")).toEqual([
      { heading: null, text: "Intro." },
      { heading: "About", text: "First.\n\nSecond." },
      { heading: "Later", text: "Third." },
    ]);
  });

  it("cuts a long section at paragraph breaks", () => {
    const chunks = chunkMarkdown(`## Long\n${"word ".repeat(30)}\n\n${"word ".repeat(30)}`, 200);
    expect(chunks).toHaveLength(2);
    expect(chunks.every((chunk) => chunk.heading === "Long")).toBe(true);
  });

  it("drops headings with nothing under them", () => {
    expect(chunkMarkdown("## Empty\n\n## Full\nText.")).toEqual([
      { heading: "Full", text: "Text." },
    ]);
  });
});

// Every committed seed must be loadable, so a bad edit fails here and not on staging.
describe.each(readdirSync("seed").filter((name) => existsSync(join("seed", name, "people.json"))))(
  "seed/%s",
  (family) => {
    const dir = join("seed", family);
    const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
    const docs = join(dir, "documents");
    const data: SeedData = {
      people: read("people.json"),
      relationships: read("relationships.json"),
      places: read("places.json"),
      events: read("events.json"),
      users: existsSync(join(dir, "users.json")) ? read("users.json") : [],
      documents: readdirSync(docs).map((name) =>
        parseSeedDocument(name.replace(/\.md$/, ""), readFileSync(join(docs, name), "utf8")),
      ),
    };

    it("has no problems", () => {
      expect(validateSeed(data)).toEqual([]);
    });

    it("has questions that point at people in the seed", () => {
      const people = new Set(data.people.map((person) => person.slug));
      const lines = readFileSync(join(dir, "questions.jsonl"), "utf8").split("\n").filter(Boolean);
      const ids = new Set<string>();
      for (const line of lines) {
        const question = JSON.parse(line);
        expect(question.question && question.answer).toBeTruthy();
        expect(ids.has(question.id)).toBe(false);
        ids.add(question.id);
        if (question.asker) expect(people.has(question.asker)).toBe(true);
        for (const slug of question.sources ?? []) {
          expect([slug, data.documents.some((doc) => doc.slug === slug)]).toEqual([slug, true]);
        }
        for (const slug of question.people ?? [])
          expect([slug, people.has(slug)]).toEqual([slug, true]);
      }
      expect(lines.length).toBeGreaterThan(0);
    });
  },
);
