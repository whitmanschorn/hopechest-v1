import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { hopechest } from "./support/cli";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";
import { testPdf } from "./support/pdf";

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

/** Searches the documents and checks how many mention the words. */
async function search(page: Page, words: string, count: number) {
  await page.goto("/documents");
  await shown(page, "document-search").fill(`"${words}"`);
  await shown(page, "document-search-go").click();
  await expect(shown(page, "documents-count")).toContainText(
    count === 1 ? "1 document mentions" : `${count} documents mention`,
  );
}

/**
 * A box of scans: three slides (one with its details beside it), a typed note
 * and a letter as a PDF, a film the chest cannot take, and a file that only
 * claims to be a picture.
 */
async function makeBox(folder: string, caption: string) {
  mkdirSync(join(folder, "tray-2"), { recursive: true });
  writeFileSync(join(folder, "slide-001.jpg"), (await testJpeg()).buffer);
  writeFileSync(
    join(folder, "slide-001.json"),
    JSON.stringify({ caption, people: ["George Bluth Sr.", "Nobody Known"], date: "1976-07-04" }),
  );
  writeFileSync(join(folder, "slide-002.jpg"), (await testJpeg()).buffer);
  writeFileSync(join(folder, "tray-2", "slide-003.jpg"), (await testJpeg()).buffer);
  writeFileSync(join(folder, "notes.txt"), `Found in the attic. ${caption}`);
  writeFileSync(
    join(folder, "letter.pdf"),
    testPdf(["Dear Michael,", `About: ${caption}`, "There is always money in the banana stand."]),
  );
  writeFileSync(
    join(folder, "letter.json"),
    JSON.stringify({ title: `Letter, ${caption}`, kind: "letter", date: "sometime" }),
  );
  writeFileSync(join(folder, "film.mov"), "not something the chest takes");
  writeFileSync(join(folder, "torn.jpg"), "this is not a picture");
}

test("the ingest command says what it would send without sending it @smoke", async ({
  baseURL,
}, testInfo) => {
  const folder = testInfo.outputPath("box");
  await makeBox(folder, "Dry run");
  const run = await hopechest(baseURL!, null, "ingest", folder, "--dry-run");
  expect(run.code).toBe(0);
  expect(run.json).toMatchObject({ batch: null, found: 6, added: 0, skipped: ["film.mov"] });
  expect(run.stderr).toContain("6 files would be sent");

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

  // Three slides and two documents arrive; the film is left alone and the torn file is reported.
  const first = await ingest();
  expect(first.json).toMatchObject({
    batch: { label, resumed: false },
    found: 6,
    added: 5,
    duplicates: 0,
    skipped: ["film.mov"],
  });
  expect(first.json.failed).toEqual([
    { file: "torn.jpg", reason: expect.stringContaining("not a picture") },
  ]);
  expect(first.json.problems).toEqual([
    { file: "letter.pdf", problems: ['Could not read the date "sometime".'] },
    { file: "slide-001.jpg", problems: ['No one in the chest is called "Nobody Known".'] },
  ]);
  expect(first.code).toBe(1);

  // Running it again sends nothing twice.
  const again = await ingest();
  expect(again.json).toMatchObject({ added: 0, duplicates: 5 });

  // Nothing shows to the family yet, and a viewer cannot open a waiting photo.
  await page.goto("/photos");
  await expect(shown(page, "photos-title")).toBeVisible();
  await expect(page.getByAltText(caption)).toHaveCount(0);

  // The batch is in the review queue with what came beside each file applied.
  await page.goto(first.json.review.replace(baseURL!, ""));
  await expect(shown(page, "batch-title")).toHaveText(label);
  await expect(shown(page, "batch-summary")).toContainText("5 waiting");
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

  // The documents wait too: the letter under the title beside it, the note under its file name.
  const papers = shown(page, "review-document");
  await expect(papers).toHaveCount(2);
  const letter = papers.filter({ hasText: `Letter, ${caption}` });
  await expect(letter).toContainText("Letter ·");
  await expect(letter.getByTestId("review-problem")).toContainText("sometime");
  await expect(papers.filter({ hasText: "notes.txt" })).toContainText("notes");
  // The date given for the box is for its photos, not the papers found with them.
  await expect(papers.filter({ hasText: "notes.txt" })).toContainText("no date yet");
  await search(page, caption, 0);
  await page.goto(first.json.review.replace(baseURL!, ""));
  await expect(page.locator('[data-testid="review-board"][data-ready="true"]')).toBeVisible();

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

  await expect(shown(page, "review-publish")).toHaveText("Publish all 4");
  await shown(page, "review-publish").click();
  await expect(shown(page, "review-done")).toBeVisible();
  await expect(shown(page, "review-result")).toContainText("Published 4 items");
  await expect(shown(page, "batch-summary")).toContainText("4 published");
  await expect(shown(page, "batch-summary")).toContainText("1 discarded");

  // Now the family sees them, in the album named on the command line.
  await viewer.reload();
  await expect(viewer.getByTestId("photo-caption")).toHaveText(caption);
  await expect(viewer.getByTestId("photo-waiting")).toHaveCount(0);
  await expect(viewer.getByTestId("photo-albums")).toContainText(label);
  await viewer.context().close();

  // The letter's words, read out of the PDF, are searchable now.
  await search(page, caption, 2);
  await expect(
    shown(page, "document-link").filter({ hasText: `Letter, ${caption}` }),
  ).toBeVisible();

  await page.goto("/review");
  const card = shown(page, "batch-card").filter({ hasText: label }).first();
  await expect(card).toBeVisible();
});

test("a Facebook export becomes a folder to ingest, with what Facebook knew about each photo", async ({
  page,
  baseURL,
}, testInfo) => {
  // A small export in the layout Facebook uses: JSON beside a media folder.
  const root = testInfo.outputPath("facebook-export");
  const media = "your_facebook_activity/posts/media";
  mkdirSync(join(root, media, "Balboa_abc"), { recursive: true });
  mkdirSync(join(root, "your_facebook_activity/posts/album"), { recursive: true });
  mkdirSync(join(root, "your_facebook_activity/messages/inbox/someone"), { recursive: true });
  const caption = unique("Café on the boardwalk");
  writeFileSync(join(root, media, "Balboa_abc", "1.jpg"), (await testJpeg()).buffer);
  writeFileSync(join(root, media, "Balboa_abc", "2.jpg"), (await testJpeg()).buffer);
  writeFileSync(
    join(root, "your_facebook_activity/posts/album/0.json"),
    JSON.stringify({
      name: "Balboa Island",
      photos: [
        {
          uri: `${media}/Balboa_abc/1.jpg`,
          creation_timestamp: 1401753600,
          // Facebook spells accented letters out byte by byte.
          description: Buffer.from(caption, "utf8").toString("latin1"),
          media_metadata: { photo_metadata: { exif_data: [{ taken_timestamp: 205286400 }] } },
        },
        { uri: `${media}/Balboa_abc/2.jpg`, creation_timestamp: 1401753600 },
        { uri: `${media}/Balboa_abc/gone.jpg`, creation_timestamp: 1401753600 },
      ],
    }),
  );
  writeFileSync(
    join(root, "your_facebook_activity/posts/your_posts_1.json"),
    JSON.stringify([
      {
        timestamp: 1401753600,
        tags: [{ name: "Lucille Bluth" }],
        attachments: [{ data: [{ media: { uri: `${media}/Balboa_abc/2.jpg` } }] }],
      },
    ]),
  );
  writeFileSync(
    join(root, "your_facebook_activity/messages/inbox/someone/message_1.json"),
    JSON.stringify({ messages: [{ photos: [{ uri: `${media}/Balboa_abc/private.jpg` }] }] }),
  );

  const out = testInfo.outputPath("from-facebook");
  const converted = await hopechest(baseURL!, null, "facebook-export", root, "--out", out);
  expect(converted.code).toBe(0);
  expect(converted.json).toMatchObject({
    found: 3,
    written: 2,
    missing: [`${media}/Balboa_abc/gone.jpg`],
    albums: { "Balboa-Island": 2 },
  });
  expect(JSON.parse(readFileSync(join(out, "Balboa-Island", "1.jpg.json"), "utf8"))).toEqual({
    caption,
    date: "1976-07-04",
    album: "Balboa Island",
    note: "Posted on Facebook, 3 June 2014.",
  });
  // It will not write into a folder that already holds something.
  const twice = await hopechest(baseURL!, null, "facebook-export", root, "--out", out);
  expect(twice.code).toBe(2);
  expect(twice.stderr).toContain("already has files");

  await signIn(page);
  const key = await makeKey(page, "ingest");
  const label = unique("From Facebook");
  const run = await hopechest(
    baseURL!,
    key,
    "ingest",
    out,
    "--label",
    label,
    "--source",
    "facebook_export",
  );
  expect(run.json).toMatchObject({ added: 2, failed: [] });

  await page.goto(run.json.review.replace(baseURL!, ""));
  await expect(shown(page, "batch-summary")).toContainText("Facebook export");
  const tiles = shown(page, "review-tile");
  const first = tiles.filter({ hasText: caption });
  await expect(first.getByTestId("review-date-shown")).toHaveText("July 4, 1976");
  await expect(first.getByTestId("review-problem")).toHaveText(
    "Note: Posted on Facebook, 3 June 2014.",
  );
  // Posted is not taken: the other photo has a tag and a note, but no date.
  const second = tiles.filter({ hasText: "2.jpg" });
  await expect(second.getByTestId("review-people")).toHaveText("Lucille Bluth");
  await expect(second.getByTestId("review-date-shown")).toHaveText("No date yet");
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
