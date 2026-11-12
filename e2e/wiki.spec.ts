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

const form = (page: Page) =>
  page.locator('[data-testid="article-form"][data-ready="true"]').filter({ visible: true });

test("everyone can read the wiki: topic pages, and what is written about each person @smoke", async ({
  page,
}) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/wiki");
  await expect(shown(page, "wiki-title")).toBeVisible();
  await expect(shown(page, "new-article")).toHaveCount(0);

  await shown(page, "wiki-topics").getByRole("link", { name: "Cornballer", exact: true }).click();
  await expect(shown(page, "article-title")).toHaveText("Cornballer");
  await expect(shown(page, "article-body")).toContainText("Arrested Development Wiki");
  await expect(shown(page, "edit-article")).toHaveCount(0);

  // A person's page is part of their profile, under the facts.
  await page.goto("/people/lucille");
  await expect(shown(page, "person-article").getByTestId("article-body")).toContainText("Lucille");
  await expect(shown(page, "edit-person-article")).toHaveCount(0);
});

test("write about a person, link to others, and bring back an earlier version", async ({
  page,
}) => {
  await signIn(page, PHONES.contributor);
  const name = unique("Wiki Person");
  const topic = unique("The Unwritten Topic");
  await addPerson(page, name);
  const profile = page.url();
  await expect(shown(page, "person-article-empty")).toBeVisible();

  await shown(page, "edit-person-article").click();
  await expect(shown(page, "edit-article-title")).toHaveText(`Write about ${name}`);
  await form(page).getByTestId("save-article").click();
  await expect(form(page)).toContainText("Write something first.");

  const first = [
    "She grew up next door to [[Lucille Bluth|Gangy]].",
    "",
    "## The summer of 1974",
    "",
    "- Worked at the stand",
    `- Wrote about [[${topic}]]`,
    "",
    "<b>Not bold</b> and **really bold**.",
  ].join("\n");
  await form(page).getByTestId("article-body-input").fill(first);

  // The preview is drawn the way the page will be.
  await form(page).getByTestId("article-view").getByText("Preview").click();
  const preview = form(page).getByTestId("article-preview");
  await expect(preview.getByRole("heading", { name: "The summer of 1974" })).toBeVisible();
  await expect(preview.getByTestId("wiki-link")).toHaveText("Gangy");
  await expect(preview.getByTestId("wiki-link-missing")).toHaveText(topic);
  await expect(preview.locator("strong")).toHaveText("really bold");
  // Markup that is not ours stays as the text that was typed.
  await expect(preview).toContainText("<b>Not bold</b>");

  await form(page).getByTestId("save-article").click();
  const story = shown(page, "person-article");
  await expect(story.getByRole("heading", { name: "The summer of 1974" })).toBeVisible();
  await expect(story.getByTestId("wiki-link")).toHaveAttribute("href", "/people/lucille");

  // A link to a page nobody has written offers to start it, with the title filled in.
  await story.getByTestId("wiki-link-missing").click();
  await expect(form(page).getByTestId("article-title-input")).toHaveValue(topic);
  await form(page)
    .getByTestId("article-body-input")
    .fill(`Nothing was ever written about it. See [[${name}]].`);
  await form(page).getByTestId("save-article").click();
  await expect(shown(page, "article-title")).toHaveText(topic);
  await expect(shown(page, "article-updated")).toContainText("George Michael");
  // The new page links back, and the person's page now links to it.
  await shown(page, "article-body").getByTestId("wiki-link").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  await expect(shown(page, "person-article").getByTestId("wiki-link-missing")).toHaveCount(0);
  await expect(shown(page, "person-article").getByTestId("wiki-link")).toHaveCount(2);

  // A second edit, with a note on what changed.
  await shown(page, "edit-person-article").click();
  await form(page).getByTestId("article-body-input").fill("She moved away and that was that.");
  await form(page).getByTestId("article-summary-input").fill("Cut it down");
  await form(page).getByTestId("save-article").click();
  await expect(shown(page, "person-article")).toContainText("She moved away and that was that.");
  await expect(shown(page, "person-article")).not.toContainText("The summer of 1974");

  // The history has both versions, and shows what the second one changed.
  await shown(page, "person-article-history").click();
  await expect(shown(page, "article-history-title")).toHaveText(`History of ${name}`);
  const rows = shown(page, "revision-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Cut it down");
  await expect(rows.first()).toContainText("Current");
  await expect(rows.first()).toContainText("+1 −8");
  await rows.first().getByTestId("revision-link").click();
  await expect(shown(page, "revision-changes").locator('[data-kind="added"]')).toHaveText(
    "She moved away and that was that.",
  );
  await expect(shown(page, "restore-revision")).toHaveCount(0);

  // Bringing the first version back adds a third on top; nothing is erased.
  await page.goBack();
  await rows.nth(1).getByTestId("revision-link").click();
  await shown(page, "restore-revision").click();
  await expect(shown(page, "revision-row")).toHaveCount(3);
  await expect(shown(page, "revision-row").first()).toContainText("Brought back the version of");
  await page.goto(profile);
  await expect(
    shown(page, "person-article").getByRole("heading", { name: "The summer of 1974" }),
  ).toBeVisible();
});

test("two people editing the same page: the second is told, and loses nothing", async ({
  page,
  context,
}) => {
  await signIn(page, PHONES.contributor);
  const title = unique("Shared Page");
  await page.goto("/wiki/new");
  await form(page).getByTestId("article-title-input").fill(title);
  await form(page).getByTestId("article-body-input").fill("The first version.");
  await form(page).getByTestId("save-article").click();
  await expect(shown(page, "article-title")).toHaveText(title);

  // Both open the editor on the same version.
  const other = await context.newPage();
  await other.goto(`${page.url()}/edit`);
  await shown(page, "edit-article").click();
  await expect(form(other)).toBeVisible();

  await form(page).getByTestId("article-body-input").fill("The first version.\n\nAdded by one.");
  await form(page).getByTestId("save-article").click();
  await expect(shown(page, "article-body")).toContainText("Added by one.");

  await form(other)
    .getByTestId("article-body-input")
    .fill("The first version.\n\nAdded by the other.");
  await form(other).getByTestId("save-article").click();
  await expect(form(other).getByTestId("article-conflict")).toContainText(
    "Someone else saved this page",
  );
  await expect(form(other).getByTestId("article-body-input")).toHaveValue(
    "The first version.\n\nAdded by the other.",
  );
  await page.reload();
  await expect(shown(page, "article-body")).not.toContainText("Added by the other.");
});

test("a program reads and adds to the wiki; a key that can only read cannot write", async ({
  page,
  request,
}) => {
  await signIn(page);
  const makeKey = async (access: "read" | "write") => {
    await page.goto("/settings");
    await shown(page, "api-key-name").fill(unique(`Spec wiki ${access} key`));
    await shown(page, "api-key-access").selectOption(access);
    await shown(page, "create-api-key").click();
    await expect(shown(page, "new-api-key")).toBeVisible();
    return { Authorization: `Bearer ${await shown(page, "new-api-key-value").inputValue()}` };
  };
  const headers = await makeKey("write");
  const title = unique("Api Topic");

  const made = await request.post("/api/v1/articles", {
    headers,
    data: { title, body: "Begun by a program.", summary: "First words" },
  });
  expect(made.status()).toBe(201);
  const { article } = await made.json();
  expect(article).toMatchObject({ title, body: "Begun by a program.", exists: true });
  const address = `/api/v1/articles/${article.ref.slug}`;

  const added = await request.patch(address, { headers, data: { append: "## Later\n\nMore." } });
  expect((await added.json()).article.body).toBe("Begun by a program.\n\n## Later\n\nMore.");
  // Saving the same text again adds no version.
  const same = await request.patch(address, { headers, data: { append: "" } });
  expect((await same.json()).changed).toBe(false);
  const { history } = await (await request.get(`${address}/history`, { headers })).json();
  expect(history).toHaveLength(2);
  expect(history[1].summary).toBe("First words");

  // A person's page is reached through the person, and is empty until written.
  const person = (
    await (
      await request.post("/api/v1/people", {
        headers,
        data: { displayName: unique("Api Subject") },
      })
    ).json()
  ).person;
  const theirs = `/api/v1/people/${person.slug}/article`;
  expect((await (await request.get(theirs, { headers })).json()).article).toMatchObject({
    exists: false,
    body: "",
  });
  const written = await request.patch(theirs, {
    headers,
    data: { body: `Known for [[${title}]].` },
  });
  expect((await written.json()).article).toMatchObject({ exists: true, title: person.displayName });
  await page.goto(`/people/${person.slug}`);
  await expect(shown(page, "person-article").getByTestId("wiki-link")).toHaveText(title);

  const listed = await (await request.get("/api/v1/articles", { headers })).json();
  expect(listed.topics.some((entry: { title: string }) => entry.title === title)).toBe(true);
  expect(
    listed.people.some((entry: { ref: { slug: string } }) => entry.ref.slug === person.slug),
  ).toBe(true);

  const readOnly = await makeKey("read");
  expect((await request.get(address, { headers: readOnly })).status()).toBe(200);
  expect(
    (await request.patch(address, { headers: readOnly, data: { append: "No." } })).status(),
  ).toBe(403);
  expect((await request.get("/api/v1/articles/no-such-page", { headers })).status()).toBe(404);
});
