import {
  buildGraph,
  cousinPhrase,
  describeKin,
  relationship,
  siblingsOf,
  type KinLink,
  type KinPerson,
} from "../kinship";

// ada + bert
//   ├─ carol + ed ── hugo, ivy
//   └─ dan + fay ─── jen ── leo (jen + kit)
// ed also has gus with his former wife nell; pat is carol's partner after ed? no: kept simple.
const people: KinPerson[] = [
  ["ada", "female"],
  ["bert", "male"],
  ["carol", "female"],
  ["dan", "male"],
  ["ed", "male"],
  ["fay", "female"],
  ["hugo", "male"],
  ["ivy", "female"],
  ["jen", "female"],
  ["kit", "male"],
  ["leo", "male"],
  ["nell", "female"],
  ["gus", "male"],
  ["sam", null],
  ["rae", "female"],
  ["tom", "male"],
].map(([id, gender]) => ({ id, gender }) as KinPerson);

const parent = (parentId: string, childId: string): KinLink => ({
  type: "parent",
  parentId,
  childId,
});
const married = (aId: string, bId: string, current = true): KinLink => ({
  type: "partner",
  aId,
  bId,
  married: true,
  current,
});

const links: KinLink[] = [
  married("ada", "bert"),
  parent("ada", "carol"),
  parent("bert", "carol"),
  parent("ada", "dan"),
  parent("bert", "dan"),
  married("carol", "ed"),
  parent("carol", "hugo"),
  parent("ed", "hugo"),
  parent("carol", "ivy"),
  parent("ed", "ivy"),
  married("dan", "fay"),
  parent("dan", "jen"),
  parent("fay", "jen"),
  married("jen", "kit"),
  parent("jen", "leo"),
  parent("kit", "leo"),
  // Ed's first marriage.
  married("ed", "nell", false),
  parent("ed", "gus"),
  parent("nell", "gus"),
  // Sam: gender not recorded, child of Dan and Fay.
  parent("dan", "sam"),
  parent("fay", "sam"),
  // Rae and Tom live together, unmarried; Rae has no other ties.
  { type: "partner", aId: "rae", bId: "tom", married: false, current: true },
];

const family = buildGraph(people, links);
const label = (from: string, to: string) => describeKin(family, from, to);

describe("direct family", () => {
  it("names parents and children", () => {
    expect(label("hugo", "carol")).toBe("mother");
    expect(label("hugo", "ed")).toBe("father");
    expect(label("carol", "hugo")).toBe("son");
    expect(label("carol", "ivy")).toBe("daughter");
  });

  it("names siblings and half-siblings", () => {
    expect(label("hugo", "ivy")).toBe("sister");
    expect(relationship(family, "hugo", "gus")).toEqual({
      kind: "sibling",
      half: true,
      label: "half-brother",
    });
  });

  it("names partners by what they are", () => {
    expect(label("carol", "ed")).toBe("husband");
    expect(label("ed", "carol")).toBe("wife");
    expect(label("rae", "tom")).toBe("partner");
    expect(relationship(family, "ed", "nell")).toEqual({
      kind: "former-partner",
      label: "former wife",
    });
  });

  it("says so when a partner has died", () => {
    const pair = buildGraph(
      [
        { id: "michael", gender: "male" },
        { id: "tracey", gender: "female" },
      ],
      [
        {
          type: "partner",
          aId: "michael",
          bId: "tracey",
          married: true,
          current: true,
          widowed: true,
        },
      ],
    );
    expect(describeKin(pair, "michael", "tracey")).toBe("late wife");
  });

  it("uses neutral words when gender is not recorded", () => {
    expect(label("dan", "sam")).toBe("child");
    expect(label("jen", "sam")).toBe("sibling");
    expect(label("leo", "sam")).toBe("aunt or uncle");
  });
});

describe("across generations", () => {
  it("names grandparents and great-grandparents, both ways", () => {
    expect(label("hugo", "ada")).toBe("grandmother");
    expect(label("ada", "hugo")).toBe("grandson");
    expect(relationship(family, "leo", "bert")).toEqual({
      kind: "grandparent",
      greats: 1,
      label: "great-grandfather",
    });
    expect(label("ada", "leo")).toBe("great-grandson");
  });

  it("names aunts, uncles, nieces and nephews", () => {
    expect(label("hugo", "dan")).toBe("uncle");
    expect(label("dan", "ivy")).toBe("niece");
    expect(label("leo", "carol")).toBe("great-aunt");
    expect(label("carol", "leo")).toBe("great-nephew");
  });

  it("names cousins with degree and removal", () => {
    expect(label("hugo", "jen")).toBe("first cousin");
    expect(relationship(family, "hugo", "leo")).toMatchObject({
      kind: "cousin",
      degree: 1,
      removal: 1,
    });
    expect(label("leo", "ivy")).toBe("first cousin once removed");
    expect(cousinPhrase({ degree: 2, removal: 2 })).toBe("second cousin twice removed");
    expect(cousinPhrase({ degree: 7 })).toBe("7th cousin");
  });
});

describe("through marriage", () => {
  it("names in-laws", () => {
    expect(label("ed", "ada")).toBe("mother-in-law");
    expect(label("ada", "ed")).toBe("son-in-law");
    expect(label("ed", "dan")).toBe("brother-in-law");
    expect(label("carol", "fay")).toBe("sister-in-law");
  });

  it("names step-family", () => {
    expect(label("gus", "carol")).toBe("stepmother");
    expect(label("carol", "gus")).toBe("stepson");
  });

  it("marks an aunt or uncle by marriage", () => {
    expect(label("hugo", "fay")).toBe("aunt (by marriage)");
  });

  it("does not make in-laws out of a marriage that ended", () => {
    expect(label("nell", "hugo")).toBeNull();
    expect(label("hugo", "nell")).toBeNull();
  });
});

describe("edges of the record", () => {
  it("returns null for strangers, unknown people and oneself", () => {
    expect(label("rae", "ada")).toBeNull();
    expect(label("ada", "nobody")).toBeNull();
    expect(label("ada", "ada")).toBeNull();
  });

  it("survives a loop in the data", () => {
    const loop = buildGraph(
      [
        { id: "a", gender: "male" },
        { id: "b", gender: "male" },
      ],
      [parent("a", "b"), parent("b", "a"), parent("a", "a")],
    );
    expect(relationship(loop, "a", "b")).not.toBeNull();
  });

  it("prefers the parent link when an adoptive parent is also a sister", () => {
    // Mimi is mother of both Lucille and Lindsay; Lucille adopted Lindsay.
    const bluth = buildGraph(
      [
        { id: "mimi", gender: "female" },
        { id: "lucille", gender: "female" },
        { id: "lindsay", gender: "female" },
        { id: "george", gender: "male" },
        { id: "michael", gender: "male" },
      ],
      [
        parent("mimi", "lucille"),
        parent("mimi", "lindsay"),
        parent("lucille", "lindsay"),
        parent("george", "lindsay"),
        parent("lucille", "michael"),
        parent("george", "michael"),
      ],
    );
    expect(describeKin(bluth, "lindsay", "lucille")).toBe("mother");
    expect(describeKin(bluth, "lucille", "lindsay")).toBe("daughter");
    expect(siblingsOf(bluth, "lindsay")).toEqual(["michael"]);
    expect(describeKin(bluth, "michael", "lindsay")).toBe("sister");
  });

  it("lists siblings including half-siblings", () => {
    expect(siblingsOf(family, "hugo").sort()).toEqual(["gus", "ivy"]);
    expect(siblingsOf(family, "ada")).toEqual([]);
  });

  it("keeps the stronger of two links for one couple", () => {
    const twice = buildGraph(
      [
        { id: "a", gender: "female" },
        { id: "b", gender: "male" },
      ],
      [{ type: "partner", aId: "a", bId: "b", married: false, current: false }, married("b", "a")],
    );
    expect(describeKin(twice, "a", "b")).toBe("husband");
  });
});
