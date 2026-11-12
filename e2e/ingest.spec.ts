import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { hopechest } from "./support/cli";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page, access: "read" | "ingest"): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique(`Spec ingest ${access} key`));
  await shown(page, "api-key-access").selectOption(access);
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

/** A box of scans: three slides (one with its details beside it), a note, and a file that is not a picture. */
async function makeBox(folder: string, caption: string) {
  mkdirSync(join(folder, "tray-2"), { recursive: true });
  writeFileSync(join(folder, "slide-001.jpg"), (await testJpeg()).buffer);
  writeFileSync(
    join(folder, "slide-001.json"),
    JSON.stringify({ caption, people: ["George Bluth Sr.", "Nobody Known"], date: "1976-07-04" }),
  );
  writeFileSync(join(folder, "slide-002.jpg"), (await testJpeg()).buffer);
  writeFileSync(join(folder, "tray-2", "slide-003.jpg"), (await testJpeg()).buffer);
  writeFileSync(join(folder, "notes.txt"), "Found in the attic.");
  writeFileSync(join(folder, "torn.jpg"), "this is not a picture");
}

test("the ingest command says what it would send without sending it @smoke", async ({
  baseURL,
}, testInfo) => {
  const folder = testInfo.outputPath("box");
  await makeBox(folder, "Dry run");
  const run = await hopechest(baseURL!, null, "ingest", folder, "--dry-run");
  expect(run.code).toBe(0);
  expect(run.json).toMatchObject({ batch: null, found: 4, added: 0, skipped: ["notes.txt"] });
  expect(run.stderr).toContain("4 pictures would be sent");

  const empty = await hopechest(baseURL!, null, "ingest", testInfo.outputPath("nowhere"));
  expect(empty.code).toBe(2);
  expect(empty.stderr).toContain("is not a folder");
});

test("a folder of scans comes in as a batch, waits for review, and is published from the website", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await signIn(page);
  const key = await makeKey(page, "ingest");
  const folder = testInfo.outputPath("box");
  const caption = unique("Banana stand, opening day");
  const label = unique("Carousel");
  await makeBox(folder, caption);
  const ingest = () =>
    hopechest(
      baseURL!,
      key,
      "ingest",
      folder,
      "--label",
      label,
      "--date",
      "1974",
      "--album",
      label,
    );

  // Three slides arrive; the note is left alone and the torn file is reported.
  const first = await ingest();
  expect(first.json).toMatchObject({
    batch: { label, resumed: false },
    found: 4,
    added: 3,
    duplicates: 0,
    skipped: ["notes.txt"],
  });
  expect(first.json.failed).toEqual([
    { file: "torn.jpg", reason: expect.stringContaining("not a picture") },
  ]);
  expect(first.json.problems).toEqual([
    { file: "slide-001.jpg", problems: ['No one in the chest is called "Nobody Known".'] },
  ]);
  expect(first.code).toBe(1);

  // Running it again sends nothing twice.
  const again = await ingest();
  expect(again.json).toMatchObject({ added: 0, duplicates: 3 });

  // Nothing shows to the family yet, and a viewer cannot open a waiting photo.
  await page.goto("/photos");
  await expect(shown(page, "photos-title")).toBeVisible();
  await expect(page.getByAltText(caption)).toHaveCount(0);

  // The batch is in the review queue with what came beside each file applied.
  await page.goto(first.json.review.replace(baseURL!, ""));
  await expect(shown(page, "batch-title")).toHaveText(label);
  await expect(shown(page, "batch-summary")).toContainText("3 waiting");
  await expect(shown(page, "batch-failed")).toContainText("torn.jpg");
  await expect(page.locator('[data-testid="review-board"][data-ready="true"]')).toBeVisible();
  const tiles = shown(page, "review-tile");
  await expect(tiles).toHaveCount(3);
  const captioned = tiles.filter({ hasText: caption });
  await expect(captioned.getByTestId("review-date-shown")).toHaveText("July 4, 1976");
  await expect(captioned.getByTestId("review-people")).toHaveText("George Bluth Sr.");
  await expect(captioned.getByTestId("review-problem")).toContainText("Nobody Known");
  // The others took the date given for the whole box.
  const second = tiles.filter({ hasText: "slide-002.jpg" });
  await expect(second.getByTestId("review-date-shown")).toHaveText("1974");

  const waitingId = (await captioned.getByTestId("review-open").getAttribute("href"))!
    .split("/")
    .pop()!;
  const viewer = await (await browser.newContext()).newPage();
  await signIn(viewer, PHONES.viewer);
  await viewer.goto(`/photos/${waitingId}`);
  await expect(viewer.getByTestId("photo-caption")).toHaveCount(0);

  // Correct one date, throw one out, publish the rest.
  await second.getByTestId("review-pick").check();
  await shown(page, "review-date").fill("the day after never");
  await shown(page, "review-set-date").click();
  await expect(shown(page, "review-result")).toContainText("Include a year");
  await shown(page, "review-date").fill("July 1975");
  await shown(page, "review-set-date").click();
  await expect(second.getByTestId("review-date-shown")).toHaveText("July 1975");

  await second.getByTestId("review-pick").uncheck();
  await tiles.filter({ hasText: "tray-2/slide-003.jpg" }).getByTestId("review-pick").check();
  await shown(page, "review-discard").click();
  await expect(tiles).toHaveCount(2);

  await expect(shown(page, "review-publish")).toHaveText("Publish all 2");
  await shown(page, "review-publish").click();
  await expect(shown(page, "review-done")).toBeVisible();
  await expect(shown(page, "review-result")).toContainText("Published 2 photos");
  await expect(shown(page, "batch-summary")).toContainText("2 published");
  await expect(shown(page, "batch-summary")).toContainText("1 discarded");

  // Now the family sees them, in the album named on the command line.
  await viewer.reload();
  await expect(viewer.getByTestId("photo-caption")).toHaveText(caption);
  await expect(viewer.getByTestId("photo-waiting")).toHaveCount(0);
  await expect(viewer.getByTestId("photo-albums")).toContainText(label);
  await viewer.context().close();

  await page.goto("/review");
  const card = shown(page, "batch-card").filter({ hasText: label }).first();
  await expect(card).toBeVisible();
});

test("a key that can only read cannot bring anything in", async ({ page, baseURL }, testInfo) => {
  await signIn(page);
  const key = await makeKey(page, "read");
  const folder = testInfo.outputPath("box");
  await makeBox(folder, "Never arrives");
  const run = await hopechest(baseURL!, key, "ingest", folder, "--label", unique("Refused"));
  expect(run.code).toBe(1);
  expect(run.stderr).toContain("403");
  expect(run.json).toBeNull();
});

test("the review queue is only for people who can add photos", async ({ page }) => {
  await signIn(page, PHONES.viewer);
  await expect(page.getByRole("link", { name: "Review" })).toHaveCount(0);
  await page.goto("/review");
  await expect(page.getByTestId("review-title")).toHaveCount(0);
});
