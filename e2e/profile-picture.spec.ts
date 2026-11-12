import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function addPerson(page: Page, name: string) {
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
}

/** The picture in the person page's heading, once it has loaded. */
async function headingPicture(page: Page) {
  const picture = shown(page, "person-picture").locator("img");
  await expect(picture).toHaveJSProperty("complete", true);
  return picture;
}

const editor = (page: Page) =>
  page.locator('[data-testid="picture-editor"][data-ready="true"]').filter({ visible: true });

test("upload a picture, place it in the circle, save it, then remove it", async ({ page }) => {
  await signIn(page);
  const name = unique("Picture Person");
  await addPerson(page, name);
  await expect(shown(page, "person-picture").locator("img")).toHaveCount(0);

  await shown(page, "change-picture").click();
  await expect(shown(page, "picture-title")).toHaveText(`Picture of ${name}`);
  await expect(shown(page, "picture-no-choices")).toBeVisible();
  await editor(page)
    .locator('input[type="file"]')
    .setInputFiles(await testJpeg({ width: 800, height: 400 }));

  // The window opens on the middle of the photo; zoom in and drag it.
  const window = shown(page, "picture-window");
  const image = window.locator("img");
  await expect(image).toHaveCSS("left", "-140px");
  await shown(page, "picture-zoom").getByRole("slider").focus();
  await page.keyboard.press("End");
  await expect(image).toHaveCSS("width", "2240px");
  await window.focus();
  const before = await image.evaluate((element) => getComputedStyle(element).left);
  await page.keyboard.press("ArrowLeft");
  await expect(image).not.toHaveCSS("left", before);

  await shown(page, "picture-save").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  const picture = await headingPicture(page);
  expect(await picture.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(512);
  expect(await picture.evaluate((element: HTMLImageElement) => element.naturalHeight)).toBe(512);

  // The change is in the person's history.
  await shown(page, "person-history").click();
  await expect(shown(page, "history-entry").first()).toContainText("Profile picture");

  await page.goBack();
  await shown(page, "change-picture").click();
  await shown(page, "picture-remove").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  await expect(shown(page, "person-picture").locator("img")).toHaveCount(0);
});

test("choose a profile picture from the photos someone is tagged in", async ({ page }) => {
  await signIn(page);
  const name = unique("Tagged Person");
  await addPerson(page, name);
  const personPath = new URL(page.url()).pathname;

  await page.goto("/photos/upload");
  await page
    .locator('[data-testid="upload-dropzone"][data-ready="true"]')
    .filter({ visible: true })
    .locator('input[type="file"]')
    .setInputFiles(await testJpeg());
  await shown(page, "upload-link").click();
  await page.waitForURL(/\/photos\/[0-9a-f-]{36}$/);
  await shown(page, "photo-people-input").fill(name);
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
  await shown(page, "save-photo").click();
  await expect(shown(page, "photo-people").getByRole("link", { name })).toBeVisible();

  await page.goto(`${personPath}/picture`);
  await expect(editor(page)).toBeVisible();
  await expect(shown(page, "picture-choice")).toHaveCount(1);
  await shown(page, "picture-choice").click();
  await expect(shown(page, "picture-window")).toBeVisible();
  await shown(page, "picture-save").click();

  await expect(shown(page, "person-name")).toHaveText(name);
  const picture = await headingPicture(page);
  expect(await picture.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(512);
});

test("someone who can only read may change their own picture and nobody else's", async ({
  page,
}) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/people/maeby");
  await expect(shown(page, "change-picture")).toBeVisible();
  await shown(page, "change-picture").click();
  await expect(shown(page, "picture-title")).toHaveText("Your profile picture");

  await page.goto("/people/michael");
  await expect(shown(page, "person-name")).toBeVisible();
  await expect(shown(page, "change-picture")).toHaveCount(0);
  // Typing the address does not get around it.
  await page.goto("/people/michael/picture");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
