import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { hopechest } from "./support/cli";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page, access: "read" | "write"): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique(`Spec CLI ${access} key`));
  await shown(page, "api-key-access").selectOption(access);
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

test("the command-line tool explains itself without a key or a server @smoke", async ({
  baseURL,
}) => {
  const help = await hopechest(baseURL!, null, "help");
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("find-people");
  expect(help.stdout).toContain("HOPECHEST_<NAME>_API_KEY");

  const fields = await hopechest(baseURL!, null, "add-event", "--help");
  expect(fields.stdout).toContain("Runs POST /api/v1/events");
  expect(fields.stdout).toContain("participants (needed)");

  // Asked to do something without a key, it says how to get one.
  const noKey = await hopechest(baseURL!, null, "find-people");
  expect(noKey.code).toBe(2);
  expect(noKey.stderr).toContain("export HOPECHEST_SPEC_API_KEY=hc_");

  const unknown = await hopechest(baseURL!, null, "summon-people");
  expect(unknown.code).toBe(2);
  expect(unknown.stderr).toContain('No command "summon-people"');
});

test("with a read-only key it answers the marriage question and is refused a change", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  const key = await makeKey(page, "read");
  const run = (...args: string[]) => hopechest(baseURL!, key, ...args);

  const me = await run("whoami");
  expect(me.json.chest.slug).toBe("bluth");
  expect(me.json.caller.scopes).toEqual(["read"]);
  expect(me.json.routes.allowed).toBeLessThan(me.json.routes.of);

  const kin = await run("resolve-kin", "person=george-michael", "words=grandma and grandpa");
  const grandpa = kin.json.kin.find((entry: { word: string }) => entry.word === "grandpa");
  expect(grandpa.people.map((person: { slug: string }) => person.slug)).toEqual(["george-sr"]);

  const marriages = await run("list-events", "kind=marriage", "person=george-sr");
  const wedding = marriages.json.events.find((event: { participants: { slug: string }[] }) =>
    event.participants.some((participant) => participant.slug === "lucille"),
  );
  expect(wedding.date.display).toBe("February 13, 1965");

  // The same route, spelled out.
  const raw = await run("get", `events/${wedding.id}`);
  expect(raw.json.sources[0].citation).toContain("Marriage licence and certificate");

  // A mistake in the command is caught before anything is sent.
  const typo = await run("list-events", "kind=wedding");
  expect(typo.code).toBe(2);
  expect(typo.stderr).toMatch(/^kind: /);

  // The server's refusals come back on stderr with a failing exit code.
  const refused = await run("add-person", "displayName=Should Not Exist");
  expect(refused.code).toBe(1);
  expect(refused.stderr).toContain("403");
  expect(refused.stderr).toContain("forbidden");
  const lost = await run("get-person", "slug=nobody-by-this-name");
  expect(lost.code).toBe(1);
  expect(lost.stderr).toContain("not_found");
});

test("with a key that can change things it adds a person, and the website shows them", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  const key = await makeKey(page, "write");
  const run = (...args: string[]) => hopechest(baseURL!, key, ...args);

  const name = unique("Cli Cousin");
  const added = await run(
    "add-person",
    `displayName=${name}`,
    "nicknames=Cee, C",
    "born=around 1952",
    "living=false",
  );
  expect(added.code).toBe(0);
  const person = added.json.person;
  expect(person.values.nicknames).toEqual(["Cee", "C"]);
  expect(person.values.born).toMatchObject({ year: 1952, precision: "circa" });
  expect(person.values.isLiving).toBe(false);

  // A whole JSON body works too, and name=value on top of it wins.
  const changed = await run(
    "update-person",
    `slug=${person.slug}`,
    "--body",
    '{"notes":"From a file.","nicknames":["Cee"]}',
    "notes=Added from the command line.",
  );
  expect(changed.json.person.values).toMatchObject({
    notes: "Added from the command line.",
    nicknames: ["Cee"],
  });

  // What the chest will not accept comes back with the field at fault.
  const bad = await run("update-person", `slug=${person.slug}`, "born=the day after never");
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("422");
  expect(bad.stderr).toContain('"born"');

  await page.goto(`/people/${person.slug}`);
  await expect(shown(page, "person-name")).toHaveText(name);
  await expect(page.getByText("Added from the command line.")).toBeVisible();
});
