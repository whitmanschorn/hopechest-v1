import { describeArgs, isClaimAction } from "../actions";

describe("describeArgs", () => {
  it("turns an event proposal into lines a person can read", () => {
    expect(
      describeArgs({
        kind: "marriage",
        title: "George and Lucille marry",
        date: "1965-02-13",
        deduced: false,
        participants: [
          { person: "george-sr" },
          { person: "lucille" },
          { person: "j-walter-weatherman", role: "witness" },
        ],
        description: "",
      }),
    ).toEqual([
      { label: "Kind", value: "marriage" },
      { label: "Title", value: "George and Lucille marry" },
      { label: "Date", value: "1965-02-13" },
      { label: "Date was worked out", value: "no" },
      { label: "People", value: "george-sr, lucille, j-walter-weatherman (witness)" },
    ]);
  });

  it("spells out a relationship and unknown fields", () => {
    expect(
      describeArgs({
        slug: "buster",
        role: "parent",
        other: "oscar",
        qualifier: "biological",
        someNewField: ["a", "b"],
      }),
    ).toEqual([
      { label: "Who or where", value: "buster" },
      { label: "They are this person's", value: "parent" },
      { label: "Other person", value: "oscar" },
      { label: "How", value: "biological" },
      { label: "Some new field", value: "a, b" },
    ]);
  });

  it("makes nothing of something that is not an object", () => {
    expect(describeArgs(null)).toEqual([]);
    expect(describeArgs(["x"])).toEqual([]);
  });
});

describe("isClaimAction", () => {
  it("allows changes to the family graph only", () => {
    expect(isClaimAction("add_event")).toBe(true);
    expect(isClaimAction("delete_event")).toBe(false);
    expect(isClaimAction("update_photo")).toBe(false);
  });
});
