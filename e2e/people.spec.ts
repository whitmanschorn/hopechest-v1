import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

// The admin test number belongs to Michael Bluth in the seed, so "your ..."
// labels below are from Michael's point of view.

/** A name no other run or spec will use, so specs never touch seeded people. */
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function addPerson(page: Page, name: string, fields: Record<string, string> = {}) {
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  for (const [field, value] of Object.entries(fields)) {
    await shown(page, `field-${field}`).fill(value);
  }
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
}

test("people lists the family with how each is related to you @smoke", async ({ page }) => {
  await signIn(page);
  await shown(page, "nav-people").click();
  await expect(shown(page, "people-title")).toBeVisible();

  const george = shown(page, "person-george-sr");
  await expect(george).toContainText("George Bluth Sr.");
  await expect(george).toContainText("b. 1940");
  await expect(george.getByTestId("kin")).toHaveText("Your father");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("You");
  await expect(shown(page, "person-maeby").getByTestId("kin")).toHaveText("Your niece");
  await expect(shown(page, "person-tobias").getByTestId("kin")).toHaveText("Your brother-in-law");
  await expect(shown(page, "person-tracey")).toContainText("d. c. 2000");
});

test("search finds people by nickname and former name", async ({ page }) => {
  await signIn(page);
  await page.goto("/people");
  await shown(page, "people-search").fill("lucille 2");
  await shown(page, "people-search-submit").click();
  await expect(page).toHaveURL(/q=lucille\+2/);
  await expect(shown(page, "person-lucille-austero")).toBeVisible();
  await expect(shown(page, "person-lucille")).toHaveCount(0);

  await page.goto("/people?q=jenkins");
  await expect(shown(page, "person-lucille")).toBeVisible();

  await page.goto("/people?q=zzzz-nobody");
  await expect(shown(page, "people-empty")).toHaveText("No one by that name.");
});

test("a person's page shows their life, family and events @smoke", async ({ page }) => {
  await signIn(page);
  await page.goto("/people/buster");
  await expect(shown(page, "person-name")).toHaveText("Buster Bluth");
  await expect(shown(page, "person-kin")).toHaveText("Your brother");
  await expect(shown(page, "person-lifespan")).toHaveText("b. 1972");

  // Two fathers, told apart by kind.
  const parents = shown(page, "family-parents");
  await expect(parents.getByTestId("relative-george-sr")).toContainText("legal");
  await expect(parents.getByTestId("relative-oscar")).toContainText("biological");
  await expect(parents.getByTestId("relative-lucille")).toContainText("Your mother");
  await expect(shown(page, "family-siblings").getByTestId("relative-gob")).toBeVisible();
  await expect(
    shown(page, "family-partners").getByTestId("relative-lucille-austero"),
  ).toContainText("until death");
  await expect(shown(page, "person-events")).toContainText("Buster loses his left hand to a seal");
});

test("a deduced date is shown as a deduction, with its clue", async ({ page }) => {
  await signIn(page);
  await page.goto("/people/lucille");
  const wedding = page
    .getByTestId("person-event")
    .filter({ hasText: "George Sr. and Lucille marry" });
  await expect(wedding).toContainText("around 1965");
  await expect(wedding).toContainText("Date deduced: No record gives the wedding date.");
  await expect(wedding.getByRole("link", { name: "George Bluth Sr." })).toHaveAttribute(
    "href",
    "/people/george-sr",
  );
});

test("add a person, edit them, and see the changes in their history", async ({ page }) => {
  await signIn(page);
  const name = unique("Testy McTest");
  await page.goto("/people");
  await shown(page, "add-person").click();
  await expect(shown(page, "new-person-title")).toBeVisible();

  // A name is required, and a bad date is explained without losing what was typed.
  await shown(page, "field-displayName").fill(name);
  await shown(page, "field-born").fill("spring");
  await shown(page, "save-person").click();
  await expect(shown(page, "person-form")).toContainText("Include a year");
  await expect(shown(page, "field-displayName")).toHaveValue(name);

  await shown(page, "field-born").fill("1950-06-10");
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  await expect(shown(page, "person-lifespan")).toHaveText("b. 1950");
  await expect(shown(page, "person-about")).toContainText("June 10, 1950");

  await shown(page, "edit-person").click();
  await shown(page, "field-nicknames").fill("Testy, T");
  await shown(page, "field-born").fill("around 1951");
  await shown(page, "save-person").click();
  await expect(shown(page, "person-about")).toContainText("Testy, T");
  await expect(shown(page, "person-lifespan")).toHaveText("b. c. 1951");

  await shown(page, "person-history").click();
  const entries = shown(page, "history-entry");
  await expect(entries).toHaveCount(3);
  await expect(entries.filter({ hasText: "Nicknames" })).toContainText("Testy, T");
  const born = entries.filter({ hasText: "Born" });
  await expect(born).toContainText("June 10, 1950");
  await expect(born).toContainText("circa 1951");
  await expect(born).toContainText("Michael Bluth");
});

test("add a new person as someone's child, then link and unlink a relative", async ({ page }) => {
  await signIn(page);
  const parent = unique("Parent Tester");
  const child = unique("Child Tester");
  await addPerson(page, parent, { born: "1950" });
  const parentUrl = page.url();

  // A brand-new person, added from the parent's page.
  await shown(page, "add-relative").click();
  await shown(page, "relative-form").getByTestId("relative-role").selectOption("child");
  await shown(page, "relative-new").click();
  await expect(shown(page, "new-relative-role")).toHaveValue("parent");
  await shown(page, "new-relative-qualifier").selectOption("adoptive");
  await shown(page, "field-displayName").fill(child);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(child);
  const parents = shown(page, "family-parents");
  await expect(parents).toContainText(parent);
  await expect(parents).toContainText("adoptive");

  // Someone already in the chest, picked from the list.
  await shown(page, "add-relative").click();
  const form = shown(page, "relative-form");
  await form.getByTestId("relative-role").selectOption("partner");
  await form.getByTestId("relative-person").fill("Steve Ho");
  await page.getByRole("option", { name: "Steve Holt" }).click();
  await form.getByTestId("save-relative").click();
  await expect(shown(page, "family-partners").getByTestId("relative-steve-holt")).toContainText(
    "married",
  );

  // The same link twice is refused.
  await shown(page, "add-relative").click();
  await form.getByTestId("relative-role").selectOption("partner");
  await form.getByTestId("relative-person").fill("Steve Ho");
  await page.getByRole("option", { name: "Steve Holt" }).click();
  await form.getByTestId("save-relative").click();
  await expect(shown(page, "relative-error")).toHaveText("That relationship is already recorded.");
  await page.keyboard.press("Escape");

  // Unlink: the link goes, both people stay, and the history remembers.
  await shown(page, "family-partners").getByTestId("remove-relationship").click();
  await shown(page, "confirm-remove").click();
  await expect(shown(page, "family-partners")).toHaveCount(0);
  await shown(page, "person-history").click();
  await expect(shown(page, "history-list")).toContainText("Partner (married): Steve Holt");

  // A child cannot be made their own parent's parent.
  await page.goto(parentUrl);
  await expect(shown(page, "family-children")).toContainText(child);
  await shown(page, "add-relative").click();
  await form.getByTestId("relative-role").selectOption("parent");
  await form.getByTestId("relative-person").fill(child);
  await page.getByRole("option", { name: child }).click();
  await form.getByTestId("save-relative").click();
  await expect(shown(page, "relative-error")).toHaveText(
    "That would make someone their own ancestor.",
  );
});

test("a viewer can read but is not offered ways to change anything", async ({ page }) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/people");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("Your uncle");
  await expect(shown(page, "add-person")).toHaveCount(0);

  await page.goto("/people/lindsay");
  await expect(shown(page, "person-kin")).toHaveText("Your mother");
  await expect(shown(page, "edit-person")).toHaveCount(0);
  await expect(shown(page, "add-relative")).toHaveCount(0);
  await expect(shown(page, "remove-relationship")).toHaveCount(0);

  // Typing the address does not get around it.
  await page.goto("/people/new");
  await expect(shown(page, "new-person-title")).toHaveCount(0);
  await page.goto("/people/lindsay/edit");
  await expect(shown(page, "edit-person-title")).toHaveCount(0);
});

test("an unknown person is a not-found page", async ({ page }) => {
  await signIn(page);
  await page.goto("/people/nobody-by-this-name");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
