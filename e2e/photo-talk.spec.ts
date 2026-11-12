import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Uploads one picture and opens its page. Returns the page's path. */
async function addPhoto(page: Page): Promise<string> {
  await page.goto("/photos/upload");
  await page
    .locator('[data-testid="upload-dropzone"][data-ready="true"]')
    .filter({ visible: true })
    .locator('input[type="file"]')
    .setInputFiles(await testJpeg({ width: 800, height: 600 }));
  await shown(page, "upload-link").click();
  await page.waitForURL(/\/photos\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test("react to a photo and take it back", async ({ page }) => {
  await signIn(page);
  await addPhoto(page);

  const love = shown(page, "react-love");
  await expect(love).toHaveAttribute("aria-pressed", "false");
  await expect(love).toHaveAttribute("data-count", "0");
  await love.click();
  await expect(love).toHaveAttribute("aria-pressed", "true");
  await expect(love).toHaveAttribute("data-count", "1");
  await expect(shown(page, "react-funny")).toHaveAttribute("data-count", "0");

  await love.click();
  await expect(love).toHaveAttribute("aria-pressed", "false");
  await expect(love).toHaveAttribute("data-count", "0");
});

test("family members comment on a photo; each can delete their own, an admin any", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const path = await addPhoto(page);
  await expect(shown(page, "no-comments")).toBeVisible();

  // Nothing typed is not a comment.
  await shown(page, "post-comment").click();
  await expect(shown(page, "comment-form")).toContainText("Write something first");

  await shown(page, "comment-input").fill("Is that the banana stand behind them?");
  await shown(page, "post-comment").click();
  const comments = shown(page, "comment");
  await expect(comments).toHaveCount(1);
  await expect(shown(page, "comment-author")).toHaveText("Michael Bluth");
  await expect(shown(page, "comment-body")).toHaveText("Is that the banana stand behind them?");
  await expect(shown(page, "comment-input")).toHaveValue("");

  // Someone who can only read can still join in.
  const context = await browser.newContext();
  const theirs = await context.newPage();
  await signIn(theirs, PHONES.viewer);
  await theirs.goto(path);
  await expect(theirs.getByTestId("comment")).toHaveCount(1);
  // They cannot delete Michael's comment, and have no editing tools.
  await expect(theirs.getByTestId("delete-comment")).toHaveCount(0);
  await expect(theirs.getByTestId("photo-form")).toHaveCount(0);
  await theirs.getByTestId("comment-input").fill("It is. Summer of 2003.");
  await theirs.getByTestId("post-comment").click();
  await expect(theirs.getByTestId("comment")).toHaveCount(2);
  await expect(theirs.getByTestId("comment-author").nth(1)).toHaveText("Maeby Fünke");
  await expect(theirs.getByTestId("delete-comment")).toHaveCount(1);
  await theirs.getByTestId("react-like").click();
  await expect(theirs.getByTestId("react-like")).toHaveAttribute("data-count", "1");

  await theirs.getByTestId("comment-input").fill("Posted twice by mistake");
  await theirs.getByTestId("post-comment").click();
  await expect(theirs.getByTestId("comment")).toHaveCount(3);
  await theirs.getByTestId("delete-comment").nth(1).click();
  await expect(theirs.getByTestId("comment")).toHaveCount(2);
  await context.close();

  // The admin sees both, and may take down either.
  await page.reload();
  await expect(shown(page, "comment")).toHaveCount(2);
  await expect(shown(page, "react-like")).toHaveAttribute("data-count", "1");
  await expect(shown(page, "react-like")).toHaveAttribute("aria-pressed", "false");
  await expect(shown(page, "delete-comment")).toHaveCount(2);
  await shown(page, "delete-comment").nth(1).click();
  await expect(shown(page, "comment")).toHaveCount(1);
  await expect(shown(page, "comment-body")).toHaveText("Is that the banana stand behind them?");
});

test("mark where someone is in a photo; their page and profile picture use it", async ({
  page,
}) => {
  await signIn(page);
  const name = unique("Boxed Person");
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  const personPath = new URL(page.url()).pathname;
  const slug = personPath.split("/").pop()!;
  await expect(shown(page, "person-photos")).toHaveCount(0);

  const photoPath = await addPhoto(page);
  // Nobody is tagged yet, so there is nobody to mark.
  await expect(shown(page, "face-tools")).toHaveCount(0);
  await expect(
    page.locator('[data-testid="photo-form"][data-ready="true"]').filter({ visible: true }),
  ).toBeVisible();
  await shown(page, "photo-people-input").fill(name);
  await page.getByRole("option", { name }).click();
  await page.keyboard.press("Escape");
  await shown(page, "save-photo").click();
  await expect(shown(page, "photo-people").getByRole("link", { name })).toBeVisible();

  await page
    .locator('[data-testid="face-tools"][data-ready="true"]')
    .filter({ visible: true })
    .getByTestId(`mark-${slug}`)
    .click();
  await expect(shown(page, "marking-hint")).toContainText(name);
  const stage = shown(page, "photo-stage");
  // Centred on screen, so the page header is not over the part being dragged on.
  await stage.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const bounds = (await stage.boundingBox())!;
  // A box in the right half: from (60%, 40%) to (80%, 70%).
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.5);
  await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.7);
  await page.mouse.up();

  const box = shown(page, "face-box");
  await expect(box).toHaveCount(1);
  await expect(box).toHaveAttribute("data-person", slug);
  await expect(box).toContainText(name);
  await expect(shown(page, "marking-hint")).toHaveCount(0);
  const placed = await box.evaluate((element: HTMLElement) => ({
    left: parseFloat(element.style.left),
    width: parseFloat(element.style.width),
  }));
  expect(placed.left).toBeCloseTo(60, 0);
  expect(placed.width).toBeCloseTo(20, 0);

  // It is still there after a reload, and can be shown without a mouse.
  await page.reload();
  await expect(shown(page, "face-box")).toHaveCount(1);
  await shown(page, "show-faces").click();
  await expect(shown(page, "show-faces")).toHaveAttribute("aria-pressed", "true");

  // The person's page lists their photos.
  await page.goto(personPath);
  await expect(shown(page, "person-photos").locator(`a[href="${photoPath}"]`)).toBeVisible();
  await expect(shown(page, "person-photos-all")).toHaveText("See the photo");

  // Choosing that photo as a profile picture opens zoomed in on the face.
  await page.goto(`${personPath}/picture`);
  await page
    .locator('[data-testid="picture-editor"][data-ready="true"]')
    .filter({ visible: true })
    .getByTestId("picture-choice")
    .click();
  const zoom = shown(page, "picture-zoom").getByRole("slider");
  await expect(zoom).toHaveAttribute("aria-valuenow", /^(1\.[5-9]|[2-4])/);

  // The box can be removed again.
  await page.goto(photoPath);
  await page
    .locator('[data-testid="face-tools"][data-ready="true"]')
    .filter({ visible: true })
    .getByTestId(`mark-${slug}`)
    .click();
  await shown(page, "clear-box").click();
  await expect(shown(page, "face-box")).toHaveCount(0);
});
