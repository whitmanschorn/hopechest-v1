import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

/** A name no other run or spec will use, so specs never touch seeded rows. */
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const lastSegment = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;

/** The pins are what is under test; the map tiles are someone else's server. */
async function withoutTiles(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}

test("places lists where things happened, and a place lists its events @smoke", async ({
  page,
}) => {
  await signIn(page);
  await shown(page, "nav-places").click();
  await expect(shown(page, "places-title")).toBeVisible();

  const home = shown(page, "place-model-home");
  await expect(home).toContainText("The model home, Sudden Valley");
  await expect(home).toContainText("1 Lucille Lane, Newport Beach, CA, USA");
  await expect(shown(page, "place-cabin")).toContainText("CA, USA");

  await home.click();
  await expect(shown(page, "place-name")).toHaveText("The model home, Sudden Valley");
  await expect(shown(page, "place-address")).toHaveText("1 Lucille Lane, Newport Beach, CA, USA");
  await expect(shown(page, "place-notes")).toContainText("The only finished house");
  const move = shown(page, "place-events")
    .getByTestId("event-card")
    .filter({ hasText: "The Fünkes move back to California" });
  await expect(move.getByTestId("event-date")).toHaveText("2003");
  await expect(move.getByRole("link", { name: "Tobias Fünke" })).toHaveAttribute(
    "href",
    "/people/tobias",
  );

  // A place with two events shows them oldest first.
  await page.goto("/places/banana-stand");
  await expect(shown(page, "place-events")).toContainText("The banana stand burns down");
  const titles = await shown(page, "place-events").getByTestId("event-link").allInnerTexts();
  expect(titles.indexOf("The frozen banana stand opens")).toBeGreaterThanOrEqual(0);
  expect(titles.indexOf("The frozen banana stand opens")).toBeLessThan(
    titles.indexOf("The banana stand burns down"),
  );
});

test("the map pins places that have a position and lists the rest @smoke", async ({ page }) => {
  await withoutTiles(page);
  await signIn(page);
  await shown(page, "nav-map").click();
  await expect(shown(page, "map-title")).toBeVisible();

  const map = page.getByRole("region", { name: "Map of the family's places" });
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute("data-testid", "places-map");
  await expect(map).toContainText("OpenStreetMap");
  await expect(map.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );

  // Each pin opens a link to its place. Pins can sit on top of each other, so use the keyboard.
  await expect(shown(page, "map-pin-queen-mary")).toBeVisible();
  await expect(shown(page, "map-pin-model-home")).toBeVisible();
  await expect(shown(page, "map-pin-cabin")).toHaveCount(0);
  await map.getByTitle("The model home, Sudden Valley").press("Enter");
  const link = shown(page, "map-link-model-home");
  await expect(link).toHaveText("The model home, Sudden Valley");
  await expect(link).toHaveAttribute("href", "/places/model-home");

  // Places nobody has located are listed instead.
  const unpinned = shown(page, "map-unpinned");
  await expect(unpinned.getByTestId("place-cabin")).toContainText("The family cabin");
  await expect(unpinned.getByTestId("place-marina-hornblower")).toBeVisible();
  await expect(unpinned.getByTestId("place-model-home")).toHaveCount(0);

  await link.click();
  await expect(shown(page, "place-name")).toHaveText("The model home, Sudden Valley");
});

test("add a place, pin it, record an event there, then delete it", async ({ page }) => {
  await withoutTiles(page);
  await signIn(page);
  const name = unique("Test Lighthouse");
  const title = unique("Picnic at the lighthouse");
  await page.goto("/places");
  await shown(page, "add-place").click();
  await expect(shown(page, "new-place-title")).toBeVisible();

  // Latitude and longitude come together, and are real coordinates.
  await shown(page, "field-label").fill(name);
  await shown(page, "field-lat").fill("33.5");
  await shown(page, "save-place").click();
  await expect(shown(page, "place-form")).toContainText("Give the longitude too, or clear both.");
  await expect(shown(page, "field-label")).toHaveValue(name);
  await shown(page, "field-lat").fill("95");
  await shown(page, "field-lng").fill("-200");
  await shown(page, "save-place").click();
  await expect(shown(page, "place-form")).toContainText("Latitude is between -90 and 90.");
  await expect(shown(page, "place-form")).toContainText("Longitude is between -180 and 180.");

  await shown(page, "field-lat").fill("33.5");
  await shown(page, "field-lng").fill("-117.75");
  await shown(page, "field-city").fill("Laguna Beach");
  await shown(page, "save-place").click();
  await expect(shown(page, "place-name")).toHaveText(name);
  await expect(shown(page, "place-address")).toHaveText("Laguna Beach");
  await expect(shown(page, "place-coordinates")).toHaveText("Pin at 33.5, -117.75");
  const slug = lastSegment(page);

  // It is on the list and on the map.
  await page.goto("/places");
  await expect(shown(page, `place-${slug}`)).toContainText(name);
  await shown(page, `place-${slug}`).click();
  await shown(page, "place-map-link").click();
  await expect(shown(page, `map-pin-${slug}`)).toBeVisible();

  // Without a position it moves to the list under the map.
  await page.goto(`/places/${slug}`);
  await shown(page, "edit-place").click();
  await expect(shown(page, "edit-place-title")).toBeVisible();
  await expect(shown(page, "field-lat")).toHaveValue("33.5");
  await shown(page, "field-lat").fill("");
  await shown(page, "field-lng").fill("");
  await shown(page, "field-region").fill("CA");
  await shown(page, "field-notes").fill("Closed in winter.");
  await shown(page, "save-place").click();
  await expect(shown(page, "place-address")).toHaveText("Laguna Beach, CA");
  await expect(shown(page, "place-notes")).toHaveText("Closed in winter.");
  await expect(shown(page, "place-coordinates")).toHaveCount(0);
  await expect(shown(page, "place-map-link")).toHaveCount(0);
  await page.goto("/map");
  await expect(shown(page, "places-map")).toBeVisible();
  await expect(shown(page, "map-unpinned").getByTestId(`place-${slug}`)).toBeVisible();
  await expect(shown(page, `map-pin-${slug}`)).toHaveCount(0);

  // An event recorded from the place's page happens there.
  await page.goto(`/places/${slug}`);
  await shown(page, "add-event-here").click();
  await expect(shown(page, "field-place")).toHaveValue(slug);
  await shown(page, "field-title").fill(title);
  await shown(page, "field-date").fill("2001-07");
  await shown(page, "save-event").click();
  await expect(shown(page, "event-title")).toHaveText(title);
  await expect(shown(page, "event-place")).toContainText(name);
  const eventUrl = page.url();
  await shown(page, "event-place").getByRole("link").click();
  await expect(shown(page, "place-events").getByTestId("event-card")).toContainText(title);
  await expect(shown(page, "place-events").getByTestId("event-date")).toHaveText("July 2001");

  // Deleting the place keeps the event, without a place.
  await shown(page, "delete-place").click();
  await expect(page.getByRole("dialog")).toContainText(
    "The event recorded here will be kept, without a place.",
  );
  await shown(page, "confirm-delete").click();
  await expect(shown(page, "places-title")).toBeVisible();
  await expect(shown(page, `place-${slug}`)).toHaveCount(0);
  await page.goto(`/places/${slug}`);
  await expect(shown(page, "not-found-title")).toBeVisible();
  await page.goto(eventUrl);
  await expect(shown(page, "event-title")).toHaveText(title);
  await expect(shown(page, "event-place")).toHaveCount(0);

  // Leave nothing behind.
  await shown(page, "delete-event").click();
  await shown(page, "confirm-delete").click();
  await expect(shown(page, "timeline-title")).toBeVisible();
});

test("a viewer can read places but is not offered ways to change them", async ({ page }) => {
  await withoutTiles(page);
  await signIn(page, PHONES.viewer);
  await page.goto("/places");
  await expect(shown(page, "place-balboa-towers")).toBeVisible();
  await expect(shown(page, "add-place")).toHaveCount(0);

  await page.goto("/places/balboa-towers");
  await expect(shown(page, "place-name")).toHaveText("Balboa Towers penthouse");
  await expect(shown(page, "place-events")).toContainText("George Sr. moves out of the penthouse");
  await expect(shown(page, "edit-place")).toHaveCount(0);
  await expect(shown(page, "delete-place")).toHaveCount(0);
  await expect(shown(page, "add-event-here")).toHaveCount(0);

  await page.goto("/map");
  await expect(shown(page, "map-pin-balboa-towers")).toBeVisible();

  // Typing the address does not get around it.
  await page.goto("/places/new");
  await expect(shown(page, "new-place-title")).toHaveCount(0);
  await expect(shown(page, "place-form")).toHaveCount(0);
  await page.goto("/places/balboa-towers/edit");
  await expect(shown(page, "edit-place-title")).toHaveCount(0);
  await expect(shown(page, "place-form")).toHaveCount(0);
});

test("an unknown place is a not-found page", async ({ page }) => {
  await signIn(page);
  await page.goto("/places/nowhere-by-this-name");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
