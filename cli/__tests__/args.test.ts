import { z } from "zod";
import {
  buildRequest,
  commandName,
  describeFields,
  parseCommandLine,
  readInput,
  readLooseInput,
  readPairs,
  UsageError,
} from "../lib/args.ts";
import { resolveTarget, variablesFor } from "../lib/config.ts";

describe("parseCommandLine", () => {
  it("separates options, the command and what follows", () => {
    expect(parseCommandLine(["--env", "staging", "find-people", "q=lucille"])).toEqual({
      env: "staging",
      help: false,
      command: "find-people",
      rest: ["q=lucille"],
    });
  });

  it("takes options anywhere, in either spelling", () => {
    const line = parseCommandLine(["get", "people", "-e=staging", "--help"]);
    expect(line).toMatchObject({ env: "staging", help: true, command: "get", rest: ["people"] });
  });

  it("reads --body as a JSON object and refuses anything else", () => {
    expect(parseCommandLine(["post", "events", "--body", '{"title":"Wedding"}']).body).toEqual({
      title: "Wedding",
    });
    expect(() => parseCommandLine(["post", "--body", "[1]"])).toThrow(UsageError);
    expect(() => parseCommandLine(["post", "--body", "nope"])).toThrow(UsageError);
  });

  it("refuses unknown options and options missing a value", () => {
    expect(() => parseCommandLine(["--loud", "whoami"])).toThrow("Unknown option --loud.");
    expect(() => parseCommandLine(["whoami", "--env"])).toThrow("--env needs a value.");
  });
});

describe("readPairs", () => {
  it("splits on the first equals sign only", () => {
    expect(readPairs(["clue=born 9 months after a=b", "notes="])).toEqual([
      ["clue", "born 9 months after a=b"],
      ["notes", ""],
    ]);
  });

  it("refuses a word that is not name=value", () => {
    expect(() => readPairs(["lucille"])).toThrow('Expected name=value, got "lucille".');
  });
});

describe("readInput", () => {
  const shape = {
    title: z.string(),
    year: z.string().optional(),
    deduced: z.boolean().optional(),
    nicknames: z.array(z.string()).optional(),
    kind: z.enum(["marriage", "move"]).optional(),
    participants: z.array(z.object({ person: z.string() })).optional(),
  };

  it("reads each value the way its field wants it", () => {
    expect(
      readInput(shape, [
        ["title", "Wedding"],
        ["year", "1965"],
        ["deduced", "true"],
        ["nicknames", "Gangy, Mother"],
        ["participants", '[{"person":"lucille"}]'],
      ]),
    ).toEqual({
      title: "Wedding",
      year: "1965",
      deduced: true,
      nicknames: ["Gangy", "Mother"],
      participants: [{ person: "lucille" }],
    });
  });

  it("lets name=value override what --body gave", () => {
    expect(readInput(shape, [["title", "B"]], { title: "A", year: "1989" })).toEqual({
      title: "B",
      year: "1989",
    });
  });

  it("says what is wrong", () => {
    expect(() => readInput(shape, [["colour", "red"]])).toThrow(/No field "colour". Fields: title/);
    expect(() => readInput(shape, [["year", "1965"]])).toThrow("Missing title=...");
    expect(() =>
      readInput(shape, [
        ["title", "x"],
        ["kind", "party"],
      ]),
    ).toThrow(/^kind: /);
  });
});

describe("readLooseInput", () => {
  it("keeps text as text and takes lists, objects and true/false as JSON", () => {
    expect(
      readLooseInput([
        ["born", "1989"],
        ["living", "false"],
        ["nicknames", '["Gob"]'],
        ["title", "Hello, world"],
      ]),
    ).toEqual({ born: "1989", living: false, nicknames: ["Gob"], title: "Hello, world" });
  });
});

describe("buildRequest", () => {
  it("puts a GET's input in the path and the query", () => {
    expect(buildRequest("GET people/:slug/history", { slug: "george sr" })).toEqual({
      method: "GET",
      path: "people/george%20sr/history",
    });
    expect(buildRequest("GET events", { kind: "marriage", person: "lucille" })).toEqual({
      method: "GET",
      path: "events?kind=marriage&person=lucille",
    });
  });

  it("puts everything else in the body", () => {
    expect(buildRequest("PATCH people/:slug", { slug: "gob", nicknames: ["Gob"] })).toEqual({
      method: "PATCH",
      path: "people/gob",
      body: { nicknames: ["Gob"] },
    });
    expect(buildRequest("DELETE events/:id", { id: "abc" })).toEqual({
      method: "DELETE",
      path: "events/abc",
    });
  });

  it("refuses a path with a part missing", () => {
    expect(() => buildRequest("GET people/:slug", {})).toThrow("Missing slug=...");
  });
});

describe("describeFields", () => {
  it("names each field, whether it is needed, and what it takes", () => {
    expect(
      describeFields({
        slug: z.string().describe("Who"),
        kind: z.enum(["a", "b"]).optional(),
        tags: z.array(z.string()).optional(),
        living: z.boolean().optional(),
      }),
    ).toEqual([
      "slug (needed)  [text]  Who",
      "kind  [a | b]",
      "tags  [list, comma-separated]",
      "living  [true | false]",
    ]);
  });
});

describe("commandName", () => {
  it("spells tool names with dashes", () => {
    expect(commandName("find_people")).toBe("find-people");
  });
});

describe("resolveTarget", () => {
  it("defaults to the local server", () => {
    expect(resolveTarget(undefined, { HOPECHEST_LOCAL_API_KEY: "hc_x" })).toEqual({
      name: "local",
      url: "http://localhost:3000",
      key: "hc_x",
    });
  });

  it("uses --env, then HOPECHEST_TARGET", () => {
    const env = { HOPECHEST_TARGET: "staging", HOPECHEST_STAGING_API_KEY: "hc_s" };
    expect(resolveTarget(undefined, env).url).toBe("https://hopechest-staging.vercel.app");
    expect(() => resolveTarget("local", env)).toThrow(/export HOPECHEST_LOCAL_API_KEY=hc_/);
  });

  it("takes any other deployment's address from the environment", () => {
    expect(variablesFor("schorn")).toEqual({
      url: "HOPECHEST_SCHORN_URL",
      key: "HOPECHEST_SCHORN_API_KEY",
    });
    expect(() => resolveTarget("schorn", {})).toThrow(/Set HOPECHEST_SCHORN_URL/);
    expect(
      resolveTarget("schorn", {
        HOPECHEST_SCHORN_URL: "https://example.test/",
        HOPECHEST_SCHORN_API_KEY: "hc_k",
      }),
    ).toEqual({ name: "schorn", url: "https://example.test", key: "hc_k" });
  });

  it("refuses a name that is not one", () => {
    expect(() => resolveTarget("../x", {})).toThrow(UsageError);
  });
});
