import { parseFuzzyDate } from "@/lib/fuzzyDate";
import { slugify, uniqueSlug } from "@/lib/slug";
import { initials, lifespan } from "../lifespan";
import {
  diffPerson,
  parseList,
  parsePersonForm,
  toFormInput,
  type PersonFormInput,
} from "../personEdit";

const blank: PersonFormInput = {
  displayName: "",
  givenName: "",
  familyName: "",
  birthFamilyName: "",
  nicknames: "",
  alternateNames: "",
  gender: "",
  living: "",
  born: "",
  died: "",
  notes: "",
};

describe("lifespan", () => {
  const date = (text: string) => parseFuzzyDate(text);
  it("shows what is known", () => {
    expect(lifespan(date("1940-09-24"), date("2012"))).toBe("1940–2012");
    expect(lifespan(date("1967-12-14"), null)).toBe("b. 1967");
    expect(lifespan(null, date("c. 2000"))).toBe("d. c. 2000");
    expect(lifespan(null, null)).toBeNull();
  });
  it("marks deduced years as approximate", () => {
    expect(lifespan({ ...date("1940-09-24")!, deduced: true }, null)).toBe("b. c. 1940");
  });
});

describe("initials", () => {
  it("takes first and last name, skipping suffixes and punctuation", () => {
    expect(initials("George Bluth Sr.")).toBe("GB");
    expect(initials("G.O.B. Bluth")).toBe("GB");
    expect(initials("Mimi")).toBe("M");
    expect(initials("  ")).toBe("?");
  });
});

describe("slugs", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Lindsay Bluth Fünke")).toBe("lindsay-bluth-funke");
    expect(slugify("  G.O.B.  ")).toBe("g-o-b");
    expect(slugify("!!!")).toBe("");
  });
  it("numbers a taken slug", () => {
    expect(uniqueSlug("lucille", new Set(["lucille", "lucille-2"]))).toBe("lucille-3");
    expect(uniqueSlug("", new Set(), "person")).toBe("person");
  });
});

describe("parsePersonForm", () => {
  it("reads a full form", () => {
    const result = parsePersonForm({
      ...blank,
      displayName: " Maeby Fünke ",
      givenName: "Mae",
      nicknames: "Maeby, Maeby, ",
      gender: "female",
      living: "yes",
      born: "1990-09-22",
    });
    expect(result).toMatchObject({
      ok: true,
      values: {
        displayName: "Maeby Fünke",
        givenName: "Mae",
        familyName: null,
        nicknames: ["Maeby"],
        gender: "female",
        isLiving: true,
        born: { year: 1990, month: 9, day: 22, precision: "day" },
        died: null,
      },
    });
  });

  it("needs a name", () => {
    expect(parsePersonForm(blank)).toEqual({
      ok: false,
      errors: { displayName: "A name is needed." },
    });
  });

  it("rejects dates without a year, deaths before births, and the living dead", () => {
    const result = parsePersonForm({
      ...blank,
      displayName: "X",
      born: "spring",
      died: "1900",
      living: "yes",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["born", "living"]);
    const order = parsePersonForm({ ...blank, displayName: "X", born: "1950", died: "1900" });
    expect(order).toMatchObject({ ok: false, errors: { died: "This is before the birth date." } });
  });

  it("treats a death date as not living", () => {
    const result = parsePersonForm({ ...blank, displayName: "Tracey", died: "c. 2000" });
    expect(result).toMatchObject({ ok: true, values: { isLiving: false } });
  });

  it("round-trips through the form", () => {
    const first = parsePersonForm({
      ...blank,
      displayName: "Buster",
      nicknames: "Buster, B",
      gender: "male",
      living: "no",
      born: "1972",
      died: "around 2040",
      notes: "Hook.",
    });
    if (!first.ok) throw new Error("expected ok");
    const again = parsePersonForm(toFormInput(first.values));
    expect(again).toEqual(first);
  });
});

describe("diffPerson", () => {
  it("lists only what changed, as shown to people", () => {
    const before = parsePersonForm({
      ...blank,
      displayName: "Lucille",
      nicknames: "Gangy",
      born: "1948",
    });
    const after = parsePersonForm({
      ...blank,
      displayName: "Lucille",
      birthFamilyName: "Jenkins",
      gender: "female",
    });
    if (!before.ok || !after.ok) throw new Error("expected ok");
    expect(diffPerson(before.values, after.values)).toEqual([
      { field: "birthFamilyName", before: null, after: "Jenkins" },
      { field: "nicknames", before: "Gangy", after: null },
      { field: "gender", before: null, after: "Female" },
      { field: "born", before: "1948", after: null },
    ]);
    expect(diffPerson(before.values, before.values)).toEqual([]);
  });
});

describe("parseList", () => {
  it("trims, drops blanks and repeats", () => {
    expect(parseList(" a, b ,, a")).toEqual(["a", "b"]);
  });
});
