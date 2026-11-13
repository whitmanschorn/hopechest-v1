import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

// These run against the scripted stand-in model, which a deployed site with a
// real model key does not use. `npm run eval:ask` is the test of real answers.
test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "needs the stand-in model");

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique("Spec ask key"));
  await shown(page, "api-key-access").selectOption("read");
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

async function askQuestion(page: Page, question: string) {
  await expect(shown(page, "ask-thread")).toHaveAttribute("data-ready", "true");
  await shown(page, "ask-input").fill(question);
  await shown(page, "ask-send").click();
  await expect(shown(page, "ask-question").last()).toHaveText(question);
  await expect(shown(page, "ask-waiting")).toHaveCount(0, { timeout: 20_000 });
}

test("ask about grandma and grandpa and get the date, with where it came from @smoke", async ({
  page,
  browser,
}) => {
  // George Michael: his grandma and grandpa are Lucille and George Sr.
  await signIn(page, PHONES.contributor);
  await page.goto("/home");
  await page.getByRole("link", { name: "Ask", exact: true }).click();
  await expect(shown(page, "ask-title")).toBeVisible();

  await askQuestion(page, "When did grandma and grandpa get married?");
  const answer = shown(page, "ask-answer").last();
  await expect(answer).toContainText("Lucille Bluth and George Bluth Sr. were married on");
  await expect(answer).toContainText("February 13, 1965");
  // What it rests on is listed and linked; a source it never looked up is not.
  const sources = answer.getByTestId("ask-source");
  await expect(sources).toHaveText([
    "George Sr. and Lucille marry",
    "Lucille Bluth",
    "George Bluth Sr.",
  ]);
  await expect(answer).not.toContainText("never-looked-up");
  await expect(shown(page, "ask-looked-up")).toContainText("Working out who that means for you");

  // The conversation has its own address now, and carries on.
  await expect(page).toHaveURL(/\/ask\/[0-9a-f-]{36}$/);
  const address = page.url();
  await askQuestion(page, "When was Lucille born?");
  await expect(shown(page, "ask-answer").last()).toContainText("no date of birth is recorded");
  await page.reload();
  await expect(shown(page, "ask-question")).toHaveText([
    "When did grandma and grandpa get married?",
    "When was Lucille born?",
  ]);
  await expect(shown(page, "ask-answer").first()).toContainText("February 13, 1965");

  // A source opens the thing itself.
  await shown(page, "ask-source").first().click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);

  // It is listed under Ask for whoever asked, and is nobody else's to read.
  await page.goto("/ask");
  await expect(shown(page, "ask-earlier-link").first()).toHaveText(
    "When did grandma and grandpa get married?",
  );
  const other = await browser.newContext();
  const theirs = await other.newPage();
  await signIn(theirs, PHONES.viewer);
  await theirs.goto(address);
  await expect(theirs.getByTestId("ask-thread")).toHaveCount(0);
  await expect(theirs.getByText("When did grandma and grandpa get married?")).toHaveCount(0);
  await other.close();

  // And it can be thrown away.
  await page.goto(address);
  await shown(page, "ask-delete").click();
  await expect(page).toHaveURL(/\/ask$/);
  await page.goto(address);
  await expect(shown(page, "ask-thread")).toHaveCount(0);
});

test("someone who can only read can ask, and an unrecorded thing is said to be unrecorded", async ({
  page,
}) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/ask");
  await expect(shown(page, "ask-examples")).toBeVisible();
  await askQuestion(page, unique("Zzyzx qwertyuiop"));
  await expect(shown(page, "ask-answer")).toContainText("it is not recorded");
  await expect(shown(page, "ask-sources")).toHaveCount(0);
});

test("a program can ask, saying who it asks for", async ({ page, request }) => {
  await signIn(page);
  const headers = { Authorization: `Bearer ${await makeKey(page)}` };
  const ask = (data: unknown) => request.post("/api/v1/ask", { headers, data });

  const answer = await (
    await ask({ question: "When did my grandma and grandpa get married?", as: "george-michael" })
  ).json();
  expect(answer.answer).toContain("February 13, 1965");
  expect(answer.citations.map((entry: { type: string }) => entry.type)).toEqual([
    "event",
    "person",
    "person",
  ]);
  expect(answer.citations[0]).toMatchObject({ number: 1, label: "George Sr. and Lucille marry" });
  expect(answer.steps).toEqual([
    "Working out who that means for you",
    "Looking through marriage events",
  ]);

  // By name, with nobody asking.
  const named = await (await ask({ question: "When was Tobias born?" })).json();
  expect(named.answer).toContain("Tobias Fünke");
  expect(named.citations).toEqual([
    expect.objectContaining({ type: "person", id: "tobias", href: "/people/tobias" }),
  ]);

  expect((await ask({ question: "  " })).status()).toBe(422);
  expect((await ask({ question: "Who is my mom?", as: "nobody-here" })).status()).toBe(422);
  expect((await ask({ question: "x".repeat(1001) })).status()).toBe(422);
  expect((await request.post("/api/v1/ask", { data: { question: "Hello?" } })).status()).toBe(401);
});
