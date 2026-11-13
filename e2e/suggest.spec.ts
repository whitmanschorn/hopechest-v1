import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

// These run against the stand-in model (src/lib/facts/fake.ts), which reads a
// few fixed sentence shapes. A deployed site uses a real model, whose answers
// are not exact enough to assert on.
test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "needs the stand-in model");

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
const facts = (page: Page) =>
  page.locator('[data-testid="page-facts"][data-ready="true"]').filter({ visible: true });
const card = (page: Page, text: string) =>
  facts(page).locator('[data-testid="claim-card"][data-ready="true"]').filter({ hasText: text });

test("what someone writes about a person is read for facts, which they accept or reject on the page", async ({
  page,
}) => {
  await signIn(page, PHONES.contributor);
  const husband = unique("Suggest Husband");
  const wife = unique("Suggest Wife");
  await addPerson(page, husband);
  await addPerson(page, wife);
  const profile = page.url();

  await shown(page, "edit-person-article").click();
  await form(page)
    .getByTestId("article-body-input")
    .fill(
      [
        "She was born in June 1931 in Newport Beach.",
        `She married [[${husband}]] in 1955.`,
        "She married [[Nobody In The Records]] in 1970.",
        "Some say she went to the moon.",
      ].join("\n\n"),
    );
  await form(page).getByTestId("save-article").click();

  // Saving does not wait for the reading; the suggestions arrive shortly after.
  await expect(shown(page, "person-article")).toContainText("born in June 1931");
  await expect(facts(page).getByTestId("page-facts-title")).toBeVisible({ timeout: 20_000 });
  // Two of the four things the model said survive: the marriage to someone not
  // in the records, and a "fact" with no words behind it, were dropped.
  await expect(facts(page).getByTestId("claim-card")).toHaveCount(2);
  const born = card(page, "was born in June 1931");
  await expect(born.getByTestId("claim-quote")).toHaveText(
    "She was born in June 1931 in Newport Beach.",
  );
  await expect(born.getByTestId("claim-origin")).toContainText("proposed by Stand-in model");
  // Nothing is recorded until someone says so.
  await expect(shown(page, "person-lifespan")).toHaveCount(0);

  await born.getByTestId("claim-accept").click();
  await expect(facts(page).getByTestId("claim-card")).toHaveCount(1);
  await expect(shown(page, "person-lifespan")).toContainText("1931");

  await card(page, "married").getByTestId("claim-accept").click();
  await expect(facts(page).getByTestId("claim-card")).toHaveCount(0);
  // The marriage is on record, and names the page as where it came from.
  await shown(page, "person-event-link").filter({ hasText: "marry" }).click();
  await expect(shown(page, "event-date")).toHaveText("1955");
  await expect(shown(page, "event-source")).toHaveText(`${wife}’s page in the wiki`);
  await shown(page, "event-source").getByRole("link").click();
  await expect(shown(page, "person-name")).toHaveText(wife);

  // Reading the page again finds nothing it has not already offered.
  await facts(page).getByTestId("page-facts-read").click();
  await expect(facts(page).getByTestId("page-facts-result")).toHaveText(
    "Nothing new to record was found in this page.",
  );

  // A new sentence brings a new suggestion. Rejected, it is not offered again.
  await shown(page, "edit-person-article").click();
  const body = form(page).getByTestId("article-body-input");
  await body.fill(`${await body.inputValue()}\n\nShe died in 2001.`);
  await form(page).getByTestId("save-article").click();
  const died = card(page, "died in 2001");
  await expect(died).toBeVisible({ timeout: 20_000 });
  await died.getByTestId("claim-reject").click();
  await died.getByTestId("claim-reject-note").fill("It was 2002.");
  await died.getByTestId("claim-reject-confirm").click();
  await expect(facts(page).getByTestId("claim-card")).toHaveCount(0);
  await page.goto(profile);
  await facts(page).getByTestId("page-facts-read").click();
  await expect(facts(page).getByTestId("page-facts-result")).toHaveText(
    "Nothing new to record was found in this page.",
  );
  await expect(shown(page, "person-lifespan")).not.toContainText("2001");
});

test("people who can only read see the story, not the suggestions", async ({ page }) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/people/lucille");
  await expect(shown(page, "person-article")).toBeVisible();
  await expect(page.getByTestId("page-facts")).toHaveCount(0);
});
