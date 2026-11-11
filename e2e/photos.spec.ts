import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

/** Follows the link to the photo just uploaded, and waits to arrive there. */
async function openUploaded(page: Page) {
  await shown(page, "upload-link").click();
  await page.waitForURL(/\/photos\/[0-9a-f-]{36}$/);
}

type Upload = Awaited<ReturnType<typeof testJpeg>>;

/** The file input is hidden by design, so find it through the visible drop area. */
const fileInput = (page: Page) =>
  page
    .locator('[data-testid="upload-dropzone"][data-ready="true"]')
    .filter({ visible: true })
    .locator('input[type="file"]');

/** Uploads pictures and waits until each has been turned into a photo. */
async function uploadPhotos(page: Page, files: Upload[]) {
  await page.goto("/photos/upload");
  await fileInput(page).setInputFiles(files);
  await expect(shown(page, "upload-summary")).toHaveText(
    `Finished: ${files.length} of ${files.length} added.`,
    {
      timeout: 30_000,
    },
  );
}

test("photos opens from the menu @smoke", async ({ page }) => {
  await signIn(page);
  await page.getByTestId("nav-photos").click();
  await expect(shown(page, "photos-title")).toHaveText("Photos");
  await expect(shown(page, "photos-count")).toHaveText(/^\d[\d,]* photos?$/);
});

test("upload a picture, see it in the grid, and read its camera date", async ({ page }) => {
  await signIn(page);
  await uploadPhotos(page, [await testJpeg({ taken: "1998:07:04 15:30:00" })]);
  await openUploaded(page);

  await expect(shown(page, "photo-caption")).toHaveText("No caption yet");
  await expect(shown(page, "photo-date")).toContainText("July 4, 1998");
  // The picture itself loads, through the signed-in file route.
  const image = shown(page, "photo-image");
  await expect(image).toHaveJSProperty("complete", true);
  expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(320);

  const address = page.url();
  await page.goto("/photos");
  const tile = page.locator(`a[href="${new URL(address).pathname}"]`).filter({ visible: true });
  await expect(tile.getByRole("img")).toHaveJSProperty("complete", true);
});

test("caption a photo, date it and say who is in it", async ({ page }) => {
  await signIn(page);
  await uploadPhotos(page, [await testJpeg()]);
  await openUploaded(page);
  await expect(shown(page, "photo-date")).toHaveText("Date not recorded");

  await shown(page, "photo-caption-input").fill("Opening day at the banana stand");
  await shown(page, "photo-date-input").fill("spring");
  await shown(page, "save-photo").click();
  await expect(shown(page, "photo-form")).toContainText("Include a year");
  await expect(shown(page, "photo-caption-input")).toHaveValue("Opening day at the banana stand");

  await shown(page, "photo-date-input").fill("around 1953");
  await shown(page, "photo-photographer-input").fill("Oscar");
  await shown(page, "photo-people-input").fill("George Bluth");
  await page.getByRole("option", { name: "George Bluth Sr." }).click();
  await shown(page, "photo-people-input").fill("Lucille Bl");
  await page.getByRole("option", { name: "Lucille Bluth" }).click();
  await page.keyboard.press("Escape");
  await shown(page, "save-photo").click();

  await expect(shown(page, "photo-caption")).toHaveText("Opening day at the banana stand");
  await expect(shown(page, "photo-date")).toHaveText("around 1953 · Taken by Oscar");
  const people = shown(page, "photo-people");
  await expect(people.getByRole("link", { name: "George Bluth Sr." })).toHaveAttribute(
    "href",
    "/people/george-sr",
  );
  await expect(people.getByRole("link", { name: "Lucille Bluth" })).toBeVisible();

  // Their photos can be listed on their own.
  const photoPath = new URL(page.url()).pathname;
  await page.goto("/photos?person=george-sr");
  await expect(shown(page, "photos-title")).toHaveText("Photos of George Bluth Sr.");
  await expect(page.locator(`a[href="${photoPath}"]`).filter({ visible: true })).toHaveCount(1);
});

test("several pictures at once; the same picture twice is not added twice", async ({ page }) => {
  await signIn(page);
  const files = [await testJpeg(), await testJpeg(), await testJpeg()];
  await uploadPhotos(page, files);
  await expect(shown(page, "upload-item")).toHaveCount(3);
  await expect(shown(page, "upload-link").first()).toHaveText("Added. Add details");

  await page.goto("/photos/upload");
  await fileInput(page).setInputFiles([files[0]]);
  await expect(shown(page, "upload-link")).toHaveText("Already in the chest", { timeout: 30_000 });
});

test("a file that is not really a picture is refused", async ({ page }) => {
  await signIn(page);
  await page.goto("/photos/upload");
  await fileInput(page).setInputFiles([
    { name: "notes.jpg", mimeType: "image/jpeg", buffer: Buffer.from("this is not a jpeg") },
  ]);
  await expect(shown(page, "upload-item")).toHaveAttribute("data-state", "failed", {
    timeout: 30_000,
  });
  await expect(shown(page, "upload-item")).toContainText("not a picture this chest can read");
});

test("delete a photo", async ({ page }) => {
  await signIn(page);
  await uploadPhotos(page, [await testJpeg()]);
  await openUploaded(page);
  const photoUrl = page.url();
  const imageUrl = await shown(page, "photo-image").getAttribute("src");

  await shown(page, "delete-photo").click();
  await page.getByTestId("confirm-delete-photo").click();
  await expect(page).toHaveURL(/\/photos$/);

  await page.goto(photoUrl);
  await expect(shown(page, "not-found-title")).toBeVisible();
  expect((await page.request.get(imageUrl!)).status()).toBe(404);
});

test("pictures are only served to people who are signed in", async ({ page, browser }) => {
  await signIn(page);
  await uploadPhotos(page, [await testJpeg()]);
  await openUploaded(page);
  const src = await shown(page, "photo-image").getAttribute("src");
  expect(src).toMatch(/^\/api\/files\/photos\//);
  expect((await page.request.get(src!)).status()).toBe(200);

  const stranger = await browser.newContext();
  const response = await stranger.request.get(src!);
  expect(response.status()).toBe(401);
  // Nor can the file route be used to read other files.
  expect((await page.request.get("/api/files/..%2F..%2Fpackage.json")).status()).toBe(404);
  await stranger.close();
});

test("a viewer sees photos but cannot add, change or delete them", async ({ page }) => {
  await signIn(page);
  await uploadPhotos(page, [await testJpeg()]);
  await openUploaded(page);
  const photoPath = new URL(page.url()).pathname;
  await page.getByTestId("user-menu").click();
  await page.getByTestId("sign-out").click();

  await signIn(page, PHONES.viewer);
  await page.goto("/photos");
  await expect(shown(page, "upload-photos")).toHaveCount(0);
  await page.goto(photoPath);
  await expect(shown(page, "photo-image")).toBeVisible();
  await expect(shown(page, "photo-form")).toHaveCount(0);

  await page.goto("/photos/upload");
  await expect(shown(page, "upload-title")).toHaveCount(0);
  // The routes behind the upload page refuse them too.
  const refused = await page.request.post("/api/photos", {
    data: { key: `originals/${crypto.randomUUID()}.jpg`, filename: "x.jpg" },
  });
  expect(refused.status()).toBe(401);
});
