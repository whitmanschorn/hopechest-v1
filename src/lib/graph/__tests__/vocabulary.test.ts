import {
  BUILTIN_PREDICATES,
  checkFact,
  NODE_KINDS,
  nodeHref,
  parseKey,
  predicateKey,
  predicatesFor,
  readLabel,
  vocabulary,
  type PredicateDef,
} from "../vocabulary";

const find = (key: string) => BUILTIN_PREDICATES.find((def) => def.key === key)!;

describe("the built-in vocabulary", () => {
  it("is well formed", () => {
    const keys = BUILTIN_PREDICATES.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const def of BUILTIN_PREDICATES) {
      expect(def.key).toMatch(/^[a-z][a-z_]*$/);
      for (const kind of [...def.subjects, ...def.objects]) expect(NODE_KINDS).toContain(kind);
      // Only links between nodes read in two directions.
      if (def.value !== "entity") {
        expect(def.inverse).toBeUndefined();
        expect(def.objects).toEqual([]);
      } else if (!def.symmetric) {
        expect(def.inverse).toBeTruthy();
      }
    }
  });

  it("offers each kind of node the facts that suit it, never the core ones", () => {
    const person = predicatesFor("person", BUILTIN_PREDICATES).map((def) => def.key);
    expect(person).toEqual(
      expect.arrayContaining(["occupation", "worked_at", "lived_at", "godparent_of"]),
    );
    expect(person).not.toContain("parent_of");
    expect(person).not.toContain("kept_by");
    const thing = predicatesFor("thing", BUILTIN_PREDICATES).map((def) => def.key);
    expect(thing).toEqual(
      expect.arrayContaining(["kept_by", "began", "located_in", "named_after"]),
    );
    expect(thing).not.toContain("occupation");
  });
});

describe("checkFact", () => {
  it("allows a fact that fits", () => {
    expect(checkFact(find("worked_at"), "person", "organization")).toBeNull();
    expect(checkFact(find("occupation"), "person", null)).toBeNull();
    expect(checkFact(find("named_after"), "animal", "person")).toBeNull();
  });

  it("says what is wrong with one that does not", () => {
    expect(checkFact(undefined, "person", null)).toMatch(/not a kind of fact/);
    expect(checkFact(find("parent_of"), "person", "person")).toMatch(/recorded on the person/);
    expect(checkFact(find("worked_at"), "place", "organization")).toMatch(
      /cannot be said about a place/,
    );
    expect(checkFact(find("worked_at"), "person", "place")).toMatch(/cannot point at a place/);
    expect(checkFact(find("worked_at"), "person", null)).toMatch(/needs someone or something/);
    expect(checkFact(find("occupation"), "person", "organization")).toMatch(/takes a value/);
  });
});

describe("reading and naming", () => {
  it("reads a fact from either end", () => {
    expect(readLabel(find("worked_at"), "subject")).toBe("worked at");
    expect(readLabel(find("worked_at"), "object")).toBe("employed");
    expect(readLabel(find("friend_of"), "object")).toBe("friend of");
  });

  it("makes a key from a family's own label, and never lets it replace a built-in", () => {
    expect(predicateKey(" Taught piano to… ")).toBe("taught_piano_to");
    const custom: PredicateDef[] = [
      {
        key: "taught_piano_to",
        label: "taught piano to",
        inverse: "learned piano from",
        value: "entity",
        subjects: ["person"],
        objects: ["person"],
        group: "other",
        custom: true,
      },
      {
        key: "occupation",
        label: "hijacked",
        value: "text",
        subjects: [],
        objects: [],
        group: "other",
        custom: true,
      },
    ];
    const all = vocabulary(custom);
    expect(all.find((def) => def.key === "taught_piano_to")).toBeTruthy();
    expect(all.find((def) => def.key === "occupation")!.label).toBe("occupation");
  });

  it("reads a node's address and finds its page", () => {
    expect(parseKey("person:lucille")).toEqual({ space: "person", slug: "lucille" });
    expect(parseKey("lucille")).toBeNull();
    expect(parseKey("person:../x")).toBeNull();
    expect(nodeHref("person:lucille")).toBe("/people/lucille");
    expect(nodeHref("page:cornballer")).toBe("/wiki/cornballer");
    expect(nodeHref("event:wedding", "abc")).toBe("/events/abc");
    expect(nodeHref("event:wedding")).toBeNull();
  });
});

describe("layoutGraph", () => {
  it("puts the node in the middle, what it touches around it, and the rest beyond", async () => {
    const { CANVAS, layoutGraph, shortName } = await import("../layout");
    const placed = layoutGraph(
      "a",
      ["a", "b", "c", "d"],
      [
        { from: "a", to: "b" },
        { from: "c", to: "a" },
        { from: "b", to: "d" },
      ],
    );
    const of = (key: string) => placed.find((entry) => entry.key === key)!;
    expect(of("a")).toMatchObject({ x: CANVAS.width / 2, y: CANVAS.height / 2, ring: 0 });
    expect([of("b").ring, of("c").ring, of("d").ring]).toEqual([1, 1, 2]);
    // The same every time, and nothing falls off the picture.
    expect(
      layoutGraph(
        "a",
        ["d", "c", "b", "a"],
        [
          { from: "b", to: "a" },
          { from: "a", to: "c" },
          { from: "d", to: "b" },
        ],
      ),
    ).toEqual(placed);
    for (const entry of placed) {
      expect(entry.x).toBeGreaterThan(0);
      expect(entry.x).toBeLessThan(CANVAS.width);
      expect(entry.y).toBeGreaterThan(0);
      expect(entry.y).toBeLessThan(CANVAS.height);
    }
    expect(shortName("Bluth's Original Frozen Banana Stand")).toBe("Bluth's Original Froz…");
  });
});
