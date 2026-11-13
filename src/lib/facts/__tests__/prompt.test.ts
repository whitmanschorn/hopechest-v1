import { fakeExtract } from "../fake";
import { argsKey, buildUserMessage, readFacts, type ExtractionInput } from "../prompt";

const input: ExtractionInput = {
  person: { slug: "lucille", name: "Lucille Bluth" },
  recorded: { born: null, died: null, birthFamilyName: null, nicknames: [], events: [] },
  people: [
    { slug: "lucille", name: "Lucille Bluth" },
    { slug: "george-sr", name: "George Bluth Sr." },
  ],
  text: "Lucille was born in June 1931 in Newport Beach.\nShe married [[george-sr]] in 1965. She married [[Stan Sitwell]] in 1999. Some say she went to the moon.",
};

const fact = (over: Record<string, unknown>) => ({
  statement: "A fact",
  action: "update_person",
  args: { slug: "lucille", born: "June 1931" },
  quote: "Lucille was born in June 1931 in Newport Beach.",
  confidence: 0.9,
  ...over,
});

describe("readFacts", () => {
  it("keeps a well-formed fact that rests on words in the text", () => {
    expect(readFacts({ facts: [fact({})] }, input)).toEqual([fact({})]);
    // Line breaks and case in the quote do not matter.
    expect(
      readFacts({ facts: [fact({ quote: "lucille was born\n in june 1931" })] }, input),
    ).toHaveLength(1);
  });

  it("drops a fact whose quote is not in the text", () => {
    expect(
      readFacts({ facts: [fact({ quote: "Lucille was born in 1930 exactly." })] }, input),
    ).toEqual([]);
    expect(readFacts({ facts: [fact({ quote: "born" })] }, input)).toEqual([]);
  });

  it("drops changes to anyone but the person the page is about, and to other fields", () => {
    expect(
      readFacts({ facts: [fact({ args: { slug: "george-sr", born: "1931" } })] }, input),
    ).toEqual([]);
    expect(readFacts({ facts: [fact({ args: { slug: "lucille", notes: "x" } })] }, input)).toEqual(
      [],
    );
    expect(readFacts({ facts: [fact({ args: { slug: "lucille" } })] }, input)).toEqual([]);
  });

  it("drops events naming someone who is not in the records, or not involving the person", () => {
    const event = (people: string[]) =>
      fact({
        action: "add_event",
        args: { kind: "marriage", title: "x", participants: people.map((person) => ({ person })) },
        quote: "She married [[george-sr]] in 1965.",
      });
    expect(readFacts({ facts: [event(["lucille", "george-sr"])] }, input)).toHaveLength(1);
    expect(readFacts({ facts: [event(["lucille", "stan-sitwell"])] }, input)).toEqual([]);
    expect(readFacts({ facts: [event(["george-sr"])] }, input)).toEqual([]);
  });

  it("drops actions it was not asked for, and anything malformed", () => {
    expect(
      readFacts(
        { facts: [fact({ action: "delete_event" }), fact({ action: "add_place" })] },
        input,
      ),
    ).toEqual([]);
    expect(
      readFacts({ facts: [null, "x", fact({ statement: "" }), fact({ args: [] })] }, input),
    ).toEqual([]);
    expect(readFacts("not json", input)).toEqual([]);
    expect(readFacts({ facts: [fact({ confidence: 7 })] }, input)[0].confidence).toBeNull();
  });
});

describe("the stand-in model", () => {
  it("finds the sentence shapes it knows, and the checks drop what it should not have said", () => {
    const facts = readFacts(fakeExtract(input), input);
    expect(facts.map((entry) => entry.statement)).toEqual([
      "Lucille Bluth was born in June 1931",
      "Lucille Bluth married George Bluth Sr. in 1965",
    ]);
    // It did say more: a marriage to someone unknown, and a moon landing.
    expect(fakeExtract(input).facts).toHaveLength(4);
  });
});

describe("argsKey and buildUserMessage", () => {
  it("spells the same arguments the same way whatever their order", () => {
    expect(argsKey("update_person", { slug: "a", born: "1931" })).toBe(
      argsKey("update_person", { born: "1931", slug: "a" }),
    );
    expect(argsKey("update_person", { slug: "a" })).not.toBe(argsKey("add_event", { slug: "a" }));
  });

  it("hands the model everything as one JSON message", () => {
    expect(JSON.parse(buildUserMessage(input))).toEqual(input);
  });
});
