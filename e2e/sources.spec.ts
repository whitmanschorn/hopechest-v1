import { expect, test } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

// "When did grandma and grandpa get married?" George Michael is the one
// asking: his grandparents are George Sr. and Lucille, and the answer is their
// marriage licence. src/lib/ask/__tests__/grandparentsMarriage.test.ts checks
// the same chain on the seed files; this checks it in the running chest.

test("grandma and grandpa's wedding date comes from their marriage licence @smoke", async ({
  page,
}) => {
  await signIn(page, PHONES.contributor);

  // Who "grandma" and "grandpa" are, for George Michael.
  await page.goto("/people/lucille");
  await expect(shown(page, "person-kin")).toHaveText("Your grandmother");
  await page.goto("/people/george-sr");
  await expect(shown(page, "person-kin")).toHaveText("Your grandfather");

  // Their marriage, with an exact date: read off a record, not deduced.
  await shown(page, "person-event-link")
    .filter({ hasText: "George Sr. and Lucille marry" })
    .click();
  await expect(shown(page, "event-title")).toHaveText("George Sr. and Lucille marry");
  await expect(shown(page, "event-kind")).toHaveText("Marriage");
  await expect(shown(page, "event-date")).toHaveText("February 13, 1965");
  await expect(shown(page, "event-clue")).toHaveCount(0);
  await expect(shown(page, "event-person-lucille")).toBeVisible();
  await expect(shown(page, "event-person-george-sr")).toBeVisible();

  // The record itself, which says the same thing.
  const source = shown(page, "event-source");
  await expect(source).toHaveText(
    "Marriage licence and certificate of George Bluth and Lucille Jenkins, 1965",
  );
  await source.getByRole("link").click();
  await expect(shown(page, "document-title")).toContainText("Marriage licence and certificate");
  await expect(shown(page, "document-kind")).toHaveText("Record");
  await expect(shown(page, "document-date")).toHaveText("February 13, 1965");
  // The original paper can be looked at, not only read as text.
  const scan = shown(page, "document-scan");
  await expect(scan).toHaveJSProperty("complete", true);
  expect(await scan.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1700);
  await expect(shown(page, "document-scan-link")).toHaveAttribute(
    "href",
    /^\/api\/files\/documents\//,
  );
  const text = shown(page, "document-text");
  await expect(text).toContainText("GEORGE OSCAR BLUTH");
  await expect(text).toContainText("LUCILLE JENKINS");
  await expect(text).toContainText("joined by me in marriage");
  await expect(text).toContainText("on the 13th day of February, 1965");
});

test("an event with no document says so", async ({ page }) => {
  await signIn(page);
  await page.goto("/people/buster");
  await shown(page, "person-event-link").filter({ hasText: "Buster joins the Army" }).click();
  await expect(shown(page, "event-no-sources")).toBeVisible();
});

test("a document that does not exist is a not-found page", async ({ page }) => {
  await signIn(page);
  await page.goto("/documents/00000000-0000-7000-8000-000000000000");
  await expect(shown(page, "not-found-title")).toBeVisible();
  await page.goto("/documents/not-an-id");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
