import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function addPerson(page: Page, name: string) {
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
}

const adder = (page: Page) =>
  page.locator('[data-testid="add-fact"][data-ready="true"]').filter({ visible: true });
const facts = (page: Page) => shown(page, "facts-panel").getByTestId("fact");

/** Opens the form and chooses the kind of fact. */
async function startFact(page: Page, predicate: string) {
  await adder(page).getByTestId("add-fact-open").click();
  await adder(page).getByTestId("fact-predicate").selectOption(predicate);
}

test("the family graph can be read by everyone: facts on a page, and the picture around it @smoke", async ({
  page,
}) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/wiki/bluth-company");
  await expect(shown(page, "page-kind")).toHaveText("Organization");
  const founded = facts(page).filter({ hasText: "founded by" });
  await expect(founded.getByTestId("fact-link")).toHaveText("George Bluth Sr.");
  await expect(founded.getByTestId("fact-source")).toContainText("Bluth Company");
  await expect(page.getByTestId("add-fact")).toHaveCount(0);

  await shown(page, "see-in-graph").click();
  await expect(shown(page, "graph-center")).toHaveText("Bluth Company");
  const nodes = shown(page, "graph-canvas").getByTestId("graph-node");
  await expect(nodes.filter({ hasText: "George Bluth Sr." })).toBeVisible();
  await expect(nodes.filter({ hasText: "Stair car" })).toBeVisible();

  // Stepping onto a node makes it the middle; kinship shows up as edges too.
  await nodes.filter({ hasText: "George Bluth Sr." }).click();
  await expect(shown(page, "graph-center")).toHaveText("George Bluth Sr.");
  await expect(
    shown(page, "graph-canvas").getByTestId("graph-node").filter({ hasText: "Lucille Bluth" }),
  ).toBeVisible();
  await expect(
    shown(page, "graph-edge-label").filter({ hasText: "partner of" }).first(),
  ).toBeVisible();

  // How is the Cornballer connected to Michael? Through his father, who made it.
  await shown(page, "graph-search").fill("Michael Bluth");
  await shown(page, "graph-search-go").click();
  await shown(page, "graph-match")
    .filter({ hasText: /^Michael Bluth$/ })
    .click();
  await expect(shown(page, "graph-center")).toHaveText("Michael Bluth");
  await shown(page, "graph-search").fill("Cornballer");
  await shown(page, "graph-search-go").click();
  await shown(page, "graph-connect").click();
  const steps = shown(page, "graph-path").getByTestId("graph-path-step");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toHaveText("child of George Bluth Sr.");
  await expect(steps.nth(1)).toHaveText("made Cornballer");
});

test("record where someone worked and what they did, with dates, and say which account is wrong", async ({
  page,
}) => {
  await signIn(page, PHONES.contributor);
  const name = unique("Graph Person");
  const company = unique("Sitwell Housing");
  await addPerson(page, name);
  const profile = page.url();
  await expect(shown(page, "facts-empty")).toBeVisible();

  // A value: an occupation, for a stretch of years.
  await startFact(page, "occupation");
  await adder(page).getByTestId("fact-value").fill("Lighthouse keeper");
  await adder(page).getByTestId("fact-from").fill("sometime");
  await adder(page).getByTestId("fact-save").click();
  await expect(adder(page)).toContainText("Include a year");
  await adder(page).getByTestId("fact-from").fill("1950");
  await adder(page).getByTestId("fact-until").fill("1962");
  await adder(page).getByTestId("fact-save").click();
  await expect(facts(page).filter({ hasText: "Lighthouse keeper" })).toContainText(
    "occupation Lighthouse keeper · 1950 to 1962",
  );

  // A link, to something that has no page yet: it is made on the spot.
  await startFact(page, "worked_at");
  await adder(page).getByTestId("fact-save").click();
  await expect(adder(page)).toContainText("needs someone or something to point at");
  await adder(page).getByTestId("fact-object-search").fill(company);
  await adder(page).getByTestId("fact-new-kind").selectOption("organization");
  await adder(page).getByTestId("fact-object-create").click();
  await expect(adder(page).getByTestId("fact-object-search")).toHaveValue(company);
  await adder(page).getByTestId("fact-note").fill("as bookkeeper");
  await adder(page).getByTestId("fact-save").click();
  const worked = facts(page).filter({ hasText: "worked at" });
  await expect(worked).toContainText(`worked at ${company} · as bookkeeper`);

  // A second account of the occupation; the first is marked as known to be wrong.
  await startFact(page, "occupation");
  await adder(page).getByTestId("fact-value").fill("Harbour pilot");
  await adder(page).getByTestId("fact-save").click();
  await expect(facts(page)).toHaveCount(3);
  await facts(page).filter({ hasText: "Lighthouse keeper" }).getByTestId("fact-menu").click();
  await page.getByTestId("fact-deprecate").click();
  await expect(facts(page).filter({ hasText: "Lighthouse keeper" })).toHaveAttribute(
    "data-rank",
    "deprecated",
  );
  await facts(page).filter({ hasText: "Harbour pilot" }).getByTestId("fact-menu").click();
  await page.getByTestId("fact-remove").click();
  await expect(facts(page)).toHaveCount(2);

  // The company has a page of its own now, which reads the fact from its side.
  await worked.getByTestId("fact-link").click();
  await expect(shown(page, "article-title")).toHaveText(company);
  await expect(shown(page, "page-kind")).toHaveValue("organization");
  await expect(shown(page, "article-empty")).toBeVisible();
  await expect(facts(page).filter({ hasText: "employed" })).toContainText(
    `employed ${name} · as bookkeeper`,
  );
  // A company can found things and own things, but has no occupation.
  await adder(page).getByTestId("add-fact-open").click();
  const kinds = adder(page).getByTestId("fact-predicate").locator("option");
  await expect(kinds.filter({ hasText: /^owned$/ })).toHaveCount(1);
  await expect(kinds.filter({ hasText: /^occupation$/ })).toHaveCount(0);

  // Saying it is a group instead sticks.
  await shown(page, "page-kind").selectOption("group");
  await page.reload();
  await expect(shown(page, "page-kind")).toHaveValue("group");

  await page.goto(profile);
  await shown(page, "see-in-graph").click();
  await expect(
    shown(page, "graph-canvas")
      .getByTestId("graph-node")
      .filter({ hasText: company.slice(0, 18) }),
  ).toBeVisible();
});

test("an admin adds the family's own kind of fact, and it can be used straight away", async ({
  page,
}) => {
  await signIn(page);
  const label = unique("taught chess to").toLowerCase();
  await page.goto("/settings");
  await shown(page, "open-vocabulary").click();
  await expect(shown(page, "vocabulary-title")).toBeVisible();
  await expect(shown(page, "predicate-row").filter({ hasText: "parent of" }).first()).toContainText(
    "Kept strictly",
  );

  const form = page.locator('[data-testid="predicate-form"][data-ready="true"]');
  await form.getByTestId("predicate-label").fill(label);
  await form.getByTestId("predicate-save").click();
  await expect(form).toContainText("Say how it reads the other way round");
  await form.getByTestId("predicate-inverse").fill("learned chess from");
  await form.getByTestId("predicate-save").click();
  await expect(form.getByTestId("predicate-added")).toContainText(label);
  await expect(shown(page, "predicate-row").filter({ hasText: label })).toContainText("Yours");

  await page.goto("/people/buster");
  await startFact(page, label.replace(/[^a-z0-9]+/g, "_"));
  await adder(page).getByTestId("fact-object-search").fill("Annyong");
  await adder(page)
    .getByTestId("fact-object-choice")
    .filter({ hasText: "Annyong Bluth · Person" })
    .click();
  await adder(page).getByTestId("fact-save").click();
  const taught = facts(page).filter({ hasText: label });
  await expect(taught.getByTestId("fact-link")).toHaveText("Annyong Bluth");
  await page.goto("/people/annyong");
  await expect(facts(page).filter({ hasText: "learned chess from" })).toContainText("Buster");

  // Left as it was found: the sample family is shared.
  await page.goto("/people/buster");
  await facts(page).filter({ hasText: label }).getByTestId("fact-menu").click();
  await page.getByTestId("fact-remove").click();
  await expect(facts(page).filter({ hasText: label })).toHaveCount(0);
});

test("a program states, ranks and removes facts, walks the graph, and proposes a fact with its source", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique("Spec graph key"));
  await shown(page, "api-key-access").selectOption("write");
  await shown(page, "create-api-key").click();
  const headers = {
    Authorization: `Bearer ${await shown(page, "new-api-key-value").inputValue()}`,
  };
  const get = async (path: string) => (await request.get(`/api/v1/${path}`, { headers })).json();
  const post = (path: string, data: unknown) => request.post(`/api/v1/${path}`, { headers, data });

  const { predicates } = await get("predicates");
  expect(predicates.find((def: { key: string }) => def.key === "worked_at")).toMatchObject({
    label: "worked at",
    inverse: "employed",
    value: "entity",
  });

  const person = (await (await post("people", { displayName: unique("Graph Api Person") })).json())
    .person;
  const key = `person:${person.slug}`;
  // Kinship is not stated as a loose fact; the kinds must fit; the dates must read.
  const core = await post("facts", {
    subject: key,
    predicate: "parent_of",
    object: "person:buster",
  });
  expect(core.status()).toBe(422);
  expect((await core.json()).fields.predicate).toContain("recorded on the person");
  const misfit = await post("facts", {
    subject: key,
    predicate: "worked_at",
    object: "place:model-home",
  });
  expect((await misfit.json()).fields.object).toContain("cannot point at a place");

  const stated = await post("facts", {
    subject: key,
    predicate: "worked_at",
    object: "page:bluth-company",
    from: "1985",
    until: "around 1990",
    note: "in the mail room",
  });
  expect(stated.status()).toBe(201);
  const { id } = await stated.json();
  const node = await get(`nodes/${key}`);
  expect(node.node).toMatchObject({ key, kind: "person" });
  expect(node.facts.find((fact: { id: string }) => fact.id === id)).toMatchObject({
    label: "worked at",
    direction: "out",
    other: { key: "page:bluth-company", kind: "organization" },
    from: "1985",
    until: "around 1990",
    note: "in the mail room",
    rank: "normal",
    core: false,
  });
  // From the company's side it reads the other way.
  const company = await get("nodes/page:bluth-company");
  expect(company.facts.find((fact: { id: string }) => fact.id === id)).toMatchObject({
    label: "employed",
    direction: "in",
    other: { key },
  });

  // The graph around them, and the way from them to the stair car.
  const around = await get(`graph?center=${key}`);
  expect(around.nodes.map((entry: { key: string }) => entry.key).sort()).toEqual(
    ["page:bluth-company", key].sort(),
  );
  const path = await get(`path?from=${key}&to=page:stair-car`);
  expect(
    path.steps.map(
      (step: { label: string; to: { name: string } }) => `${step.label} ${step.to.name}`,
    ),
  ).toEqual(["worked at Bluth Company", "owned Stair car"]);
  expect((await get(`path?from=${key}&to=place:mexico`)).steps).toBeNull();

  const ranked = await request.patch(`/api/v1/facts/${id}`, {
    headers,
    data: { rank: "preferred" },
  });
  expect(ranked.status()).toBe(200);
  expect((await get(`nodes/${key}`)).facts[0]).toMatchObject({
    id,
    rank: "preferred",
    note: "in the mail room",
  });

  // A fact read from a document is proposed; accepted, it carries the document and its words.
  const quote = `${person.displayName} kept bees behind the model home.`;
  const doc = (await (await post("documents", { title: unique("Bee notes"), text: quote })).json())
    .document;
  const claim = (
    await (
      await post("claims", {
        statement: `${person.displayName} was a beekeeper`,
        action: "add_fact",
        args: { subject: key, predicate: "occupation", value: "Beekeeper" },
        document: doc.id,
        quote,
      })
    ).json()
  ).claim;
  expect((await get(`nodes/${key}`)).facts).toHaveLength(1);
  expect((await post(`claims/${claim.id}/accept`, {})).status()).toBe(200);
  const bees = (await get(`nodes/${key}`)).facts.find(
    (fact: { value: string | null }) => fact.value === "Beekeeper",
  );
  expect(bees).toMatchObject({
    quote,
    source: { citation: doc.title, href: `/documents/${doc.id}` },
  });

  expect((await request.delete(`/api/v1/facts/${id}`, { headers })).status()).toBe(200);
  expect((await request.delete(`/api/v1/facts/${id}`, { headers })).status()).toBe(404);
  expect((await get("nodes/person:nobody-at-all")).error).toBe("not_found");
  const found = await get(`nodes?q=${encodeURIComponent("Bluth Company")}&kind=organization`);
  expect(found.nodes.map((entry: { key: string }) => entry.key)).toContain("page:bluth-company");
});
