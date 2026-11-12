import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

const dropInput = (page: Page) =>
  page
    .locator('[data-testid="upload-dropzone"][data-ready="true"]')
    .filter({ visible: true })
    .locator('input[type="file"]');

async function newAlbum(page: Page, title: string, description = ""): Promise<string> {
  await page.goto("/albums/new");
  await shown(page, "album-title-input").fill(title);
  if (description) await shown(page, "album-description-input").fill(description);
  await shown(page, "save-album").click();
  await expect(shown(page, "album-title")).toHaveText(title);
  return new URL(page.url()).pathname;
}

test("albums opens from the menu @smoke", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("nav-albums").click();
  await expect(shown(page, "albums-title")).toHaveText("Albums");
});

test("make an album, upload straight into it, choose its cover, rename it", async ({ page }) => {
  await signIn(page);

  // An album needs a name.
  await page.goto("/albums/new");
  await shown(page, "album-title-input").fill("   ");
  await shown(page, "save-album").click();
  await expect(shown(page, "album-form")).toContainText("Give the album a name");

  const title = unique("Slides box");
  const albumPath = await newAlbum(page, title, "Found in the attic at the model home.");
  await expect(shown(page, "album-count")).toHaveText("No photos yet");
  await expect(shown(page, "album-description")).toHaveText(
    "Found in the attic at the model home.",
  );
  await expect(shown(page, "album-empty")).toBeVisible();

  await shown(page, "album-add-photos").click();
  await expect(shown(page, "upload-title")).toHaveText(`Add photos to ${title}`);
  await dropInput(page).setInputFiles([await testJpeg(), await testJpeg()]);
  await expect(shown(page, "upload-summary")).toHaveText("Finished: 2 of 2 added.", {
    timeout: 30_000,
  });
  await shown(page, "upload-done").click();
  await expect(shown(page, "album-count")).toHaveText("2 photos");
  const tiles = shown(page, "photo-tile");
  await expect(tiles).toHaveCount(2);
  const second = (await tiles.nth(1).getAttribute("href"))!;

  // The second photo goes on the cover, and the album gets a better name.
  await shown(page, "edit-album").click();
  const renamed = `${title} (1987)`;
  await shown(page, "album-title-input").fill(renamed);
  await expect(shown(page, "album-cover-choice")).toHaveCount(2);
  await shown(page, "album-cover-choice").nth(1).click();
  await shown(page, "save-album").click();
  await expect(shown(page, "album-title")).toHaveText(renamed);

  await page.goto("/albums");
  const card = shown(page, "album-card").filter({ hasText: renamed });
  await expect(card).toContainText("2 photos");
  const coverSrc = await card.locator("img").getAttribute("src");
  expect(coverSrc).toContain(second.split("/").pop());
  await card.click();
  await expect(page).toHaveURL(new RegExp(`${albumPath}$`));
});

test("put a photo already in the chest into albums, take it out, delete an album", async ({
  page,
}) => {
  await signIn(page);
  const first = unique("Banana stand");
  const second = unique("Boat party");
  const firstPath = await newAlbum(page, first);
  const secondPath = await newAlbum(page, second);

  await page.goto("/photos/upload");
  await dropInput(page).setInputFiles(await testJpeg());
  await shown(page, "upload-link").click();
  await page.waitForURL(/\/photos\/[0-9a-f-]{36}$/);
  const photoPath = new URL(page.url()).pathname;
  await expect(shown(page, "photo-albums")).toHaveCount(0);

  await expect(
    page.locator('[data-testid="photo-form"][data-ready="true"]').filter({ visible: true }),
  ).toBeVisible();
  for (const title of [first, second]) {
    await shown(page, "photo-albums-input").fill(title);
    await page.getByRole("option", { name: title }).click();
  }
  await page.keyboard.press("Escape");
  await shown(page, "save-photo").click();
  const albums = shown(page, "photo-albums");
  await expect(albums.getByRole("link", { name: first })).toHaveAttribute("href", firstPath);
  await expect(albums.getByRole("link", { name: second })).toHaveAttribute("href", secondPath);

  await page.goto(firstPath);
  await expect(shown(page, "album-count")).toHaveText("1 photo");
  await expect(shown(page, "photo-tile")).toHaveAttribute("href", photoPath);

  // Deleting an album leaves its photos in the chest.
  await shown(page, "edit-album").click();
  await shown(page, "delete-album").click();
  await page.getByTestId("confirm-delete").click();
  await expect(shown(page, "albums-title")).toBeVisible();
  await expect(shown(page, "album-card").filter({ hasText: first })).toHaveCount(0);
  await page.goto(firstPath);
  await expect(shown(page, "not-found-title")).toBeVisible();

  await page.goto(photoPath);
  await expect(shown(page, "photo-image")).toBeVisible();
  await expect(shown(page, "photo-albums")).toHaveText(`In ${second}`);

  // Taking the photo out of the other album empties it.
  await shown(page, "photo-albums-input").click();
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape");
  await shown(page, "save-photo").click();
  await expect(shown(page, "photo-caption")).toBeVisible();
  await expect(shown(page, "photo-albums")).toHaveCount(0);
  await page.goto(secondPath);
  await expect(shown(page, "album-count")).toHaveText("No photos yet");
});

test("someone who can only read sees albums but cannot change them", async ({ page, browser }) => {
  await signIn(page);
  const title = unique("Read only");
  const albumPath = await newAlbum(page, title);

  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, PHONES.viewer);
  await theirs.goto("/albums");
  await expect(theirs.getByTestId("album-card").filter({ hasText: title })).toBeVisible();
  await expect(theirs.getByTestId("new-album")).toHaveCount(0);
  await theirs.goto(albumPath);
  await expect(shown(theirs, "album-title")).toHaveText(title);
  await expect(shown(theirs, "edit-album")).toHaveCount(0);
  await expect(shown(theirs, "album-add-photos")).toHaveCount(0);
  // Typing the address does not get around it.
  await theirs.goto(`${albumPath}/edit`);
  await expect(shown(theirs, "edit-album-title")).toHaveCount(0);
  await theirs.goto("/albums/new");
  await expect(shown(theirs, "new-album-title")).toHaveCount(0);
  await context.close();
});
