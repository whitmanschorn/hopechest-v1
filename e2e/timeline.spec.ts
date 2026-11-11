import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

/** A name no other run or spec will use, so specs never touch seeded rows. */
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Adds a person and returns their slug. Events in these specs are about people made here. */
async function addPerson(page: Page, name: string, born = ""): Promise<string> {
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  if (born) await shown(page, "field-born").fill(born);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function pickPerson(page: Page, name: string) {
  await shown(page, "event-people").fill(name);
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
}

const card = (page: Page, title: string) => shown(page, "event-card").filter({ hasText: title });

test("the timeline shows the family's events in order, by decade @smoke", async ({ page }) => {
  await signIn(page);
  await shown(page, "nav-timeline").click();
  await expect(shown(page, "timeline-title")).toBeVisible();

  // A deduced date is hedged, and says what it rests on.
  const wedding = shown(page, "decade-1960s")
    .getByTestId("event-card")
    .filter({ hasText: "George Sr. and Lucille marry" });
  await expect(wedding.getByTestId("event-date")).toHaveText("around 1965");
  await expect(wedding.getByTestId("event-kind")).toHaveText("Marriage");
  await expect(wedding.getByTestId("event-clue")).toContainText(
    "Date deduced: No record gives the wedding date.",
  );
  await expect(wedding.getByRole("link", { name: "George Bluth Sr." })).toHaveAttribute(
    "href",
    "/people/george-sr",
  );
  await expect(wedding.getByRole("link", { name: "Lucille Bluth" })).toHaveAttribute(
    "href",
    "/people/lucille",
  );

  // An exact date is given as written, with its place.
  const michael = shown(page, "decade-1960s")
    .getByTestId("event-card")
    .filter({ hasText: "Michael Bluth born" });
  await expect(michael.getByTestId("event-date")).toHaveText("December 14, 1967");
  const move = card(page, "The Fünkes move back to California");
  await expect(move.getByRole("link", { name: "The model home, Sudden Valley" })).toHaveAttribute(
    "href",
    "/places/model-home",
  );

  // Oldest first, and events nobody can date come last.
  const titles = await shown(page, "event-link").allInnerTexts();
  expect(titles.indexOf("George Bluth Sr. born")).toBeLessThan(
    titles.indexOf("Michael Bluth born"),
  );
  expect(titles.indexOf("Michael Bluth born")).toBeLessThan(
    titles.indexOf("Buster loses his left hand to a seal"),
  );
  await expect(shown(page, "decade-undated")).toContainText("Oscar serves in Vietnam");
  await expect(shown(page, "decade-undated")).toContainText("Date not recorded");
  const sections = await page
    .locator("section[data-testid^='decade-']:visible")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")));
  expect(sections[sections.length - 1]).toBe("decade-undated");
  expect(sections.indexOf("decade-1940s")).toBeLessThan(sections.indexOf("decade-2000s"));
});

test("the timeline can be narrowed by person and by kind @smoke", async ({ page }) => {
  await signIn(page);
  await page.goto("/timeline");
  await shown(page, "filter-person").selectOption({ label: "Buster Bluth" });
  await shown(page, "filter-submit").click();
  await expect(page).toHaveURL(/person=buster/);
  await expect(card(page, "Buster joins the Army")).toBeVisible();
  await expect(card(page, "Buster Bluth born")).toBeVisible();
  // He was there, though it is not about him.
  await expect(card(page, "Lucille Austero dies at Cinco de Cuatro")).toContainText(
    "Buster Bluth (also there)",
  );
  await expect(card(page, "Michael Bluth born")).toHaveCount(0);

  await shown(page, "filter-kind").selectOption("military");
  await shown(page, "filter-submit").click();
  await expect(page).toHaveURL(/kind=military/);
  await expect(page).toHaveURL(/person=buster/);
  await expect(card(page, "Buster joins the Army")).toBeVisible();
  await expect(card(page, "Buster Bluth born")).toHaveCount(0);

  await page.goto("/timeline?kind=marriage");
  await expect(card(page, "Michael and Tracey marry")).toBeVisible();
  await expect(card(page, "Michael Bluth born")).toHaveCount(0);
  await expect(shown(page, "filter-kind")).toHaveValue("marriage");

  await page.goto("/timeline?kind=divorce");
  await expect(shown(page, "timeline-empty")).toHaveText("No events match.");
  await shown(page, "filter-clear").click();
  await expect(card(page, "Maeby Fünke born")).toBeVisible();
});

test("an event has its own page, reached from the timeline and from a person", async ({ page }) => {
  await signIn(page);
  await page.goto("/timeline");
  await card(page, "George Sr. and Lucille adopt Annyong").getByTestId("event-link").click();
  await expect(shown(page, "event-title")).toHaveText("George Sr. and Lucille adopt Annyong");
  await expect(shown(page, "event-date")).toHaveText("2004");
  await expect(shown(page, "event-place").getByRole("link")).toHaveAttribute(
    "href",
    "/places/balboa-towers",
  );
  const people = shown(page, "event-people");
  await expect(people.getByTestId("event-person-annyong")).toHaveText("Annyong Bluth");
  await expect(people.getByTestId("event-person-lucille")).toContainText("Parent");
  await expect(people.getByTestId("event-person-george-sr").getByRole("link")).toHaveAttribute(
    "href",
    "/people/george-sr",
  );

  await page.goto("/people/lucille");
  await shown(page, "person-event-link")
    .filter({ hasText: "George Sr. and Lucille marry" })
    .click();
  await expect(shown(page, "event-title")).toHaveText("George Sr. and Lucille marry");
  await expect(shown(page, "event-date")).toHaveText("around 1965");
  await expect(shown(page, "event-clue")).toContainText("Date deduced: No record gives");
});

test("add an event from a person's page, edit it, then delete it", async ({ page }) => {
  await signIn(page);
  const name = unique("Eve Tester");
  const title = unique("Moved to the coast");
  const slug = await addPerson(page, name);

  // Starting from a person puts them in the event.
  await shown(page, "add-event").click();
  await expect(shown(page, "new-event-title")).toBeVisible();
  await expect(shown(page, `participant-${slug}`)).toContainText(name);
  await expect(shown(page, `participant-${slug}`).getByTestId("participant-role")).toHaveValue(
    "subject",
  );

  // A bad date is explained without losing what was entered.
  await shown(page, "field-kind").selectOption("move");
  await shown(page, "field-title").fill(title);
  await shown(page, "field-date").fill("spring");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText("Include a year");
  await expect(shown(page, "field-title")).toHaveValue(title);
  await expect(shown(page, "field-kind")).toHaveValue("move");
  await expect(shown(page, `participant-${slug}`)).toBeVisible();

  await shown(page, "field-date").fill("1999-05-01");
  await shown(page, "field-description").fill("By train.");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-title")).toHaveText(title);
  await expect(shown(page, "event-kind")).toHaveText("Move");
  await expect(shown(page, "event-date")).toHaveText("May 1, 1999");
  await expect(shown(page, "event-description")).toHaveText("By train.");
  await expect(shown(page, `event-person-${slug}`)).toHaveText(name);
  const eventUrl = page.url();

  // A deduced date needs its clue.
  await shown(page, "edit-event").click();
  await expect(shown(page, "edit-event-title")).toBeVisible();
  await expect(shown(page, "field-date")).toHaveValue("1999-05-01");
  await shown(page, "field-deduced").check();
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText("Say what the deduction rests on.");
  await shown(page, "field-clue").fill("The postmark on a letter.");
  await shown(page, "field-title").fill(`${title}, again`);
  await shown(page, "save-event").click();
  await expect(shown(page, "event-title")).toHaveText(`${title}, again`);
  await expect(shown(page, "event-date")).toHaveText("probably May 1, 1999");
  await expect(shown(page, "event-clue")).toHaveText("Date deduced: The postmark on a letter.");

  // It is on the timeline and on the person's page.
  await page.goto(`/timeline?person=${slug}`);
  await expect(shown(page, "timeline-count")).toHaveText("1 event matching");
  await expect(shown(page, "decade-1990s").getByTestId("event-card")).toContainText(
    `${title}, again`,
  );
  await page.goto(`/people/${slug}`);
  await expect(shown(page, "person-event")).toContainText("Date deduced: The postmark");
  await shown(page, "person-event-link").click();
  await expect(page).toHaveURL(eventUrl);

  // Deleting asks first, and removes only the event.
  await shown(page, "delete-event").click();
  await shown(page, "confirm-delete").click();
  await expect(shown(page, "timeline-title")).toBeVisible();
  await page.goto(eventUrl);
  await expect(shown(page, "not-found-title")).toBeVisible();
  await page.goto(`/people/${slug}`);
  await expect(shown(page, "person-name")).toHaveText(name);
  await expect(shown(page, "person-event")).toHaveCount(0);
});

test("births, deaths and marriages need the right people", async ({ page }) => {
  await signIn(page);
  const first = unique("Born Already");
  const second = unique("Not Yet Born");
  const firstSlug = await addPerson(page, first, "1950");
  const secondSlug = await addPerson(page, second);

  // A birth is about exactly one person...
  await page.goto("/events/new");
  await shown(page, "field-kind").selectOption("birth");
  await shown(page, "field-title").fill(`${second} born`);
  await shown(page, "field-date").fill("1980");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText("A birth is about exactly one person.");

  // ...who has not been born already.
  await pickPerson(page, first);
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText(`${first} already has a birth recorded.`);

  // Someone else can be there as a parent, but not as a second subject.
  await pickPerson(page, second);
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText("A birth is about exactly one person.");
  await shown(page, `participant-${firstSlug}`)
    .getByTestId("participant-role")
    .selectOption("parent");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-title")).toHaveText(`${second} born`);
  await expect(shown(page, `event-person-${firstSlug}`)).toContainText("Parent");

  // The person's own page picks the birth up.
  await page.goto(`/people/${secondSlug}`);
  await expect(shown(page, "person-lifespan")).toHaveText("b. 1980");

  // A marriage is between exactly two.
  await page.goto(`/events/new?person=${firstSlug}`);
  await shown(page, "field-kind").selectOption("marriage");
  await shown(page, "field-title").fill(`${first} marries`);
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText(
    "A marriage is between exactly two people.",
  );
  await pickPerson(page, second);
  await shown(page, "save-event").click();
  await expect(shown(page, "event-title")).toHaveText(`${first} marries`);
  await expect(shown(page, "event-date")).toHaveText("Date not recorded");

  // Editing cannot break the rule either.
  await shown(page, "edit-event").click();
  await shown(page, `participant-${secondSlug}`)
    .getByTestId("participant-role")
    .selectOption("witness");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-form")).toContainText(
    "A marriage is between exactly two people.",
  );
});

test("a viewer can read events but is not offered ways to change them", async ({ page }) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/timeline");
  await expect(card(page, "Maeby Fünke born")).toBeVisible();
  await expect(shown(page, "add-event")).toHaveCount(0);

  await card(page, "Maeby Fünke born").getByTestId("event-link").click();
  await expect(shown(page, "event-title")).toHaveText("Maeby Fünke born");
  await expect(shown(page, "edit-event")).toHaveCount(0);
  await expect(shown(page, "delete-event")).toHaveCount(0);
  const eventUrl = page.url();

  await page.goto("/people/maeby");
  await expect(shown(page, "person-events")).toBeVisible();
  await expect(shown(page, "add-event")).toHaveCount(0);

  // Typing the address does not get around it.
  await page.goto("/events/new");
  await expect(shown(page, "new-event-title")).toHaveCount(0);
  await expect(shown(page, "event-form")).toHaveCount(0);
  await page.goto(`${eventUrl}/edit`);
  await expect(shown(page, "edit-event-title")).toHaveCount(0);
  await expect(shown(page, "event-form")).toHaveCount(0);
});

test("an unknown event is a not-found page", async ({ page }) => {
  await signIn(page);
  await page.goto("/events/not-an-event");
  await expect(shown(page, "not-found-title")).toBeVisible();
  await page.goto("/events/00000000-0000-7000-8000-000000000000");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
