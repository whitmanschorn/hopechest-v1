import { changedParts, changeSize, diffLines } from "../diff";
import { makeResolver, parseInline, parseMarkup, plainText, slugify, wikiTargets } from "../markup";

describe("parseInline", () => {
  it("reads bold, italic, wiki links and web links", () => {
    expect(
      parseInline(
        "**Gangy** is [[lucille|Lucille]], *not* [[Lucille 2]]. See [the wiki](https://example.com/a_b).",
      ),
    ).toEqual([
      { type: "bold", children: [{ type: "text", text: "Gangy" }] },
      { type: "text", text: " is " },
      { type: "wiki", target: "lucille", label: "Lucille" },
      { type: "text", text: ", " },
      { type: "italic", children: [{ type: "text", text: "not" }] },
      { type: "text", text: " " },
      { type: "wiki", target: "Lucille 2", label: "Lucille 2" },
      { type: "text", text: ". See " },
      { type: "link", href: "https://example.com/a_b", label: "the wiki" },
      { type: "text", text: "." },
    ]);
  });

  it("leaves anything else as it was typed", () => {
    const typed = "<b>bold?</b> [not a link](javascript:alert(1)) 2 * 3 * 4 [[unclosed";
    expect(plainText(parseInline(typed))).toContain(
      "<b>bold?</b> [not a link](javascript:alert(1))",
    );
    expect(parseInline(typed).every((node) => node.type !== "link")).toBe(true);
  });
});

describe("parseMarkup", () => {
  it("reads headings, paragraphs, lists and quotations", () => {
    const blocks = parseMarkup(
      [
        "Lucille was born",
        "in Newport Beach.",
        "",
        "## Early life",
        "- waitress",
        "- met [[george-sr]]",
        "1. first",
        "2. second",
        "> I don't understand the question,",
        "> and I won't respond to it.",
        "#### Early life",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "heading",
      "list",
      "list",
      "quote",
      "heading",
    ]);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "Lucille was born in Newport Beach." }],
    });
    expect(blocks[1]).toMatchObject({ level: 2, id: "early-life" });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [expect.anything(), expect.anything()],
    });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[4].type === "quote" && plainText(blocks[4].children)).toBe(
      "I don't understand the question, and I won't respond to it.",
    );
    // A repeated heading gets its own anchor.
    expect(blocks[5]).toMatchObject({ level: 3, id: "early-life-2" });
  });

  it("makes nothing of an empty text", () => {
    expect(parseMarkup("  \n\n")).toEqual([]);
  });
});

describe("wikiTargets and makeResolver", () => {
  const resolve = makeResolver([
    { href: "/people/lucille", names: ["lucille", "Lucille Bluth", "Gangy"], rank: 0 },
    { href: "/people/mimi", names: ["mimi", "Gangy"], rank: 0 },
    {
      href: "/people/lucille-austero",
      names: ["lucille-austero", "Lucille Austero", "Lucille 2"],
      rank: 0,
    },
    { href: "/places/banana-stand", names: ["banana-stand", "The Banana Stand"], rank: 2 },
    { href: "/wiki/banana-stand", names: ["banana-stand", "The Banana Stand"], rank: 1 },
  ]);

  it("lists each link once", () => {
    expect(
      wikiTargets(
        "[[Lucille Bluth]] and **[[lucille|her]]**\n- [[The Banana Stand]]\n- [[Lucille Bluth]]",
      ),
    ).toEqual(["Lucille Bluth", "lucille", "The Banana Stand"]);
  });

  it("finds a page by any of its names, however it is typed", () => {
    expect(resolve("lucille bluth")).toBe("/people/lucille");
    expect(resolve("Lucille 2")).toBe("/people/lucille-austero");
    expect(resolve("the banana stand")).toBe("/wiki/banana-stand");
  });

  it("prefers a topic page to a place of the same name", () => {
    expect(resolve("banana-stand")).toBe("/wiki/banana-stand");
  });

  it("points at nothing when two people share a name, or nobody has it", () => {
    expect(resolve("Gangy")).toBeNull();
    expect(resolve("Cornballer")).toBeNull();
  });
});

describe("slugify", () => {
  it("makes an address-safe name", () => {
    expect(slugify("  Café on the Boardwalk! ")).toBe("cafe-on-the-boardwalk");
    expect(slugify("***")).toBe("");
  });
});

describe("diffLines", () => {
  const before = "one\ntwo\nthree\nfour\nfive\nsix\nseven";
  const after = "one\ntwo\n3\nfour\nfive\nsix\nseven\neight";

  it("marks what was added and removed", () => {
    const lines = diffLines(before, after);
    expect(lines.filter((line) => line.kind !== "same")).toEqual([
      { kind: "removed", text: "three" },
      { kind: "added", text: "3" },
      { kind: "added", text: "eight" },
    ]);
    expect(changeSize(lines)).toEqual({ added: 2, removed: 1 });
    expect(diffLines("same", "same")).toEqual([{ kind: "same", text: "same" }]);
  });

  it("can be cut down to the changes and their surroundings", () => {
    const parts = changedParts(diffLines(before, after), 1);
    expect(parts.map((part) => (part ? part.text : "…"))).toEqual([
      "two",
      "three",
      "3",
      "four",
      "…",
      "seven",
      "eight",
    ]);
  });
});
