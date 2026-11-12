import { asList, asText, matchPath, mergeText, splitArguments } from "@/lib/api/match";

describe("REST helpers", () => {
  it("matches a path against a pattern and captures the named parts", () => {
    expect(matchPath("people", ["people"])).toEqual({});
    expect(matchPath("people/:slug", ["people", "lucille"])).toEqual({ slug: "lucille" });
    expect(matchPath("people/:slug/history", ["people", "lucille", "history"])).toEqual({
      slug: "lucille",
    });
    expect(matchPath("", [])).toEqual({});
    expect(matchPath("people/:slug", ["people"])).toBeNull();
    expect(matchPath("people/:slug", ["places", "lucille"])).toBeNull();
  });

  it("turns JSON values into what someone would type", () => {
    expect(asText("1964")).toBe("1964");
    expect(asText(1964)).toBe("1964");
    expect(asText(true)).toBe("yes");
    expect(asText(false)).toBe("no");
    expect(asText(["Gob", "George Oscar"])).toBe("Gob, George Oscar");
    expect(asText(null)).toBe("");
    expect(asText({ a: 1 })).toBe("");
  });

  it("reads a list from a JSON list or comma-separated text", () => {
    expect(asList(["lucille", "george-sr"])).toEqual(["lucille", "george-sr"]);
    expect(asList("lucille, george-sr")).toEqual(["lucille", "george-sr"]);
    expect(asList(undefined)).toEqual([]);
  });

  it("changes only the fields a request mentions", () => {
    const current = { label: "Model home", city: "Newport Beach", notes: "" };
    expect(mergeText(current, { city: "Balboa", extra: "ignored", notes: null })).toEqual({
      label: "Model home",
      city: "Balboa",
      notes: "",
    });
  });

  it("splits a tool call into the path, the query and the body", () => {
    const read = splitArguments("GET", "events", { kind: "marriage", person: undefined });
    expect(read.query.toString()).toBe("kind=marriage");
    expect(read.body).toEqual({});

    const write = splitArguments("PATCH", "people/:slug", {
      slug: "lucille",
      nicknames: ["Gangy"],
      living: false,
    });
    expect(write.params).toEqual({ slug: "lucille" });
    expect(write.body).toEqual({ nicknames: ["Gangy"], living: false });
    expect(write.query.toString()).toBe("");
  });
});
