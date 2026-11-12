import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page, access: "read" | "write"): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique(`Spec MCP ${access} key`));
  await shown(page, "api-key-access").selectOption(access);
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

/** Connects the way Claude Code does: Streamable HTTP with the key as a bearer token. */
async function connect(baseURL: string, key: string): Promise<Client> {
  const client = new Client({ name: "hopechest-spec", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", baseURL), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}

/** Calls a tool and reads back the JSON it answers with. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  // Tool answers are free-form JSON; each test asserts on the shape it expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = first.text;
  try {
    body = JSON.parse(first.text);
  } catch {
    // A plain message, such as a refusal.
  }
  return { isError: result.isError === true, body };
}

test("the MCP server turns away a caller with no key @smoke", async ({ request }) => {
  const response = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(response.status()).toBe(401);
});

test("an assistant with a read-only key answers when grandma and grandpa were married, with its source", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  const client = await connect(baseURL!, await makeKey(page, "read"));

  // It is told what this is, and offered only tools that read.
  expect(client.getInstructions()).toContain("Bluth family");
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(["find_people", "resolve_kin", "list_events"]));
  expect(names).not.toContain("add_person");
  expect(names).not.toContain("delete_event");
  expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

  // George Michael asks: "When did grandma and grandpa get married?"
  const kin = await call(client, "resolve_kin", {
    person: "george-michael",
    words: "When did grandma and grandpa get married?",
  });
  const who = Object.fromEntries(
    kin.body.kin.map((entry: { word: string; people: { slug: string }[] }) => [
      entry.word,
      entry.people.map((person) => person.slug),
    ]),
  );
  // He has two grandmothers on record: his father's mother and his mother's.
  expect(who.grandma).toContain("lucille");
  expect(who.grandpa).toEqual(["george-sr"]);

  const marriages = await call(client, "list_events", { kind: "marriage", person: "george-sr" });
  const wedding = marriages.body.events.find((event: { participants: { slug: string }[] }) =>
    event.participants.some((participant) => participant.slug === "lucille"),
  );
  expect(wedding.date.display).toBe("February 13, 1965");

  const detail = await call(client, "get_event", { id: wedding.id });
  const [source] = detail.body.sources;
  expect(source.citation).toContain("Marriage licence and certificate");
  const licence = await call(client, "get_document", { id: source.documentId });
  expect(licence.body.document.text).toContain("GEORGE OSCAR BLUTH");

  // A wrong turn comes back as a tool error the assistant can read, not a crash.
  const lost = await call(client, "get_person", { slug: "nobody-by-this-name" });
  expect(lost.isError).toBe(true);
  expect(lost.body.error).toBe("not_found");
  await client.close();
});

test("an assistant with a key that can change things records a marriage, and the website shows it", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  const client = await connect(baseURL!, await makeKey(page, "write"));
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(["add_person", "add_event", "delete_event"]));

  const brideName = unique("Mcp Bride");
  const bride = (await call(client, "add_person", { displayName: brideName, born: "around 1941" }))
    .body.person;
  expect(bride.values.born).toMatchObject({ year: 1941, precision: "circa" });
  const groom = (
    await call(client, "add_person", {
      displayName: unique("Mcp Groom"),
      relation: { role: "partner", other: bride.slug, qualifier: "married" },
    })
  ).body.person;

  // The schema stops a malformed call before it reaches the chest.
  const malformed = await client
    .callTool({ name: "add_event", arguments: { kind: "wedding", title: "Not a kind" } })
    .catch((error: Error) => ({ isError: true, content: [{ type: "text", text: error.message }] }));
  expect(malformed.isError).toBe(true);

  // The chest's own rules come back as a readable error.
  const lonely = await call(client, "add_event", {
    kind: "marriage",
    title: "A wedding of one",
    participants: [{ person: bride.slug }],
  });
  expect(lonely.isError).toBe(true);
  expect(lonely.body.fields.participants).toBeTruthy();

  const wed = await call(client, "add_event", {
    kind: "marriage",
    title: "Mcp wedding",
    date: "1963",
    deduced: true,
    clue: "A year before their first child",
    participants: [{ person: bride.slug }, { person: groom.slug }],
  });
  expect(wed.isError).toBe(false);
  expect(wed.body.event.date).toMatchObject({ year: 1963, deduced: true });

  await page.goto(`/people/${bride.slug}`);
  await expect(shown(page, "person-name")).toHaveText(brideName);
  await expect(shown(page, "person-event-link").filter({ hasText: "Mcp wedding" })).toBeVisible();

  expect((await call(client, "delete_event", { id: wed.body.event.id })).isError).toBe(false);
  await client.close();
});
