import { expect, test, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";
import { testPdf } from "./support/pdf";

const token = () => `zq${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

const form = (page: Page) =>
  page.locator('[data-testid="document-form"][data-ready="true"]').filter({ visible: true });

async function search(page: Page, words: string) {
  await page.goto("/documents");
  await shown(page, "document-search").fill(words);
  await shown(page, "document-search-go").click();
  await expect(shown(page, "documents-count")).toContainText(words);
}

test("anyone in the family can search the documents by their words @smoke", async ({ page }) => {
  await signIn(page, PHONES.viewer);
  await page.goto("/documents");
  await expect(shown(page, "documents-title")).toBeVisible();
  await expect(shown(page, "new-document")).toHaveCount(0);
  await expect(shown(page, "document-row").first()).toBeVisible();

  // The marriage licence is found by a name typed on it.
  await search(page, '"George Oscar Bluth"');
  const licence = shown(page, "document-row").filter({ hasText: "Marriage licence" });
  await expect(licence.getByTestId("document-excerpt").locator("mark").first()).toHaveText(
    /george|oscar|bluth/i,
  );

  // Narrowing to stories leaves it out; records keeps it.
  await shown(page, "document-kind-story").click();
  await expect(shown(page, "document-kind-story")).toHaveAttribute("data-variant", "filled");
  await expect(shown(page, "document-row").filter({ hasText: "Marriage licence" })).toHaveCount(0);
  await shown(page, "document-kind-record").click();
  await expect(shown(page, "document-row").filter({ hasText: "Marriage licence" })).toBeVisible();

  await search(page, "xyzzyplugh");
  await expect(shown(page, "documents-count")).toContainText("0 documents mention");
});

test("type in a letter, find it by a word in it, correct it, delete it", async ({ page }) => {
  await signIn(page, PHONES.contributor);
  const word = token();
  const title = `Letter about the ${word} stand`;
  const text = `Dear Lucille,\n\nThe ${word} business is doing well this summer.\n\n## Postscript\n\nSend more bananas.`;

  await page.goto("/documents");
  await shown(page, "new-document").click();
  await form(page).getByTestId("save-document").click();
  await expect(form(page)).toContainText("Give the document a title.");
  await expect(form(page)).toContainText("Type or paste what the document says");

  await form(page).getByTestId("document-title-input").fill(title);
  await form(page).getByTestId("document-kind-input").selectOption("letter");
  await form(page).getByTestId("document-date-input").fill("the day after never");
  await form(page).getByTestId("document-text-input").fill(text);
  await form(page).getByTestId("save-document").click();
  await expect(form(page)).toContainText("Include a year");
  await form(page).getByTestId("document-date-input").fill("May 1933");
  await form(page).getByTestId("save-document").click();

  await expect(shown(page, "document-title")).toHaveText(title);
  await expect(shown(page, "document-kind")).toHaveText("Letter");
  await expect(shown(page, "document-date")).toHaveText("May 1933");
  await expect(shown(page, "document-text")).toContainText("Send more bananas.");
  const address = page.url();

  // Its words are searchable straight away.
  await search(page, word);
  await expect(shown(page, "documents-count")).toContainText("1 document mentions");
  await expect(shown(page, "document-excerpt").locator("mark").first()).toHaveText(word);

  // Typing the same letter in again adds nothing.
  await page.goto("/documents/new");
  await form(page).getByTestId("document-title-input").fill("The same letter again");
  await form(page).getByTestId("document-text-input").fill(text);
  await form(page).getByTestId("save-document").click();
  await expect(shown(page, "document-already")).toBeVisible();
  await expect(shown(page, "document-title")).toHaveText(title);
  expect(page.url().split("?")[0]).toBe(address);

  // A correction replaces the text, and the search follows it.
  const better = token();
  await shown(page, "edit-document").click();
  await form(page)
    .getByTestId("document-text-input")
    .fill(`Dear Lucille,\n\nThe ${better} business is closed.`);
  await form(page).getByTestId("save-document").click();
  await expect(shown(page, "document-text")).toContainText(`${better} business is closed`);
  await search(page, better);
  await expect(shown(page, "document-link")).toHaveText(title);

  await page.goto(`${address}/edit`);
  await expect(form(page)).toBeVisible();
  await shown(page, "delete-document").click();
  await page.getByTestId("confirm-delete").click();
  await expect(shown(page, "documents-title")).toBeVisible();
  await search(page, better);
  await expect(shown(page, "documents-count")).toContainText("0 documents mention");
});

test("a PDF is read for its words and kept as the original", async ({ page }) => {
  await signIn(page, PHONES.contributor);
  const word = token();
  await page.goto("/documents/new");
  await form(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: `deed-of-sale_${word}.pdf`,
      mimeType: "application/pdf",
      buffer: testPdf(["Deed of sale", `Parcel ${word} on Balboa Island`, "Signed in 1971."]),
    });
  await form(page).getByTestId("document-kind-input").selectOption("record");
  await form(page).getByTestId("save-document").click();

  // No title was given, so the file's name stands in.
  await expect(shown(page, "document-title")).toHaveText(`deed of sale ${word}`);
  await expect(shown(page, "document-text")).toContainText(`Parcel ${word} on Balboa Island`);
  const original = await page.request.get(
    (await shown(page, "document-file").getAttribute("href"))!,
  );
  expect(original.status()).toBe(200);
  expect(original.headers()["content-type"]).toBe("application/pdf");

  // Something that only claims to be a PDF is refused, with the reason beside the file.
  await page.goto("/documents/new");
  await form(page)
    .locator('input[type="file"]')
    .setInputFiles({
      name: "not-really.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(`not a pdf ${word}`),
    });
  await form(page).getByTestId("save-document").click();
  await expect(form(page)).toContainText("That file could not be read.");
});

test("a photo of a page is kept as the original until someone types it out", async ({ page }) => {
  await signIn(page, PHONES.contributor);
  const word = token();
  const title = `Recipe card ${word}`;
  await page.goto("/documents/new");
  await form(page)
    .locator('input[type="file"]')
    .setInputFiles(await testJpeg());
  await form(page).getByTestId("document-title-input").fill(title);
  await form(page).getByTestId("document-kind-input").selectOption("recipe");
  await form(page).getByTestId("save-document").click();

  await expect(shown(page, "document-title")).toHaveText(title);
  await expect(shown(page, "document-scan")).toHaveJSProperty("complete", true);
  await expect(shown(page, "document-no-text")).toBeVisible();

  await shown(page, "edit-document").click();
  await form(page).getByTestId("document-text-input").fill(`Hot ham water, by ${word}.`);
  await form(page).getByTestId("save-document").click();
  await expect(shown(page, "document-text")).toContainText(`Hot ham water, by ${word}.`);
  await expect(shown(page, "document-scan")).toBeVisible();
});

test("a program adds, searches, corrects and deletes documents, but cannot delete one that facts cite", async ({
  page,
  request,
}) => {
  await signIn(page);
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(`Spec documents key ${token()}`);
  await shown(page, "api-key-access").selectOption("write");
  await shown(page, "create-api-key").click();
  const key = await shown(page, "new-api-key-value").inputValue();
  const headers = { Authorization: `Bearer ${key}` };
  const word = token();

  const empty = await request.post("/api/v1/documents", { headers, data: { title: "Nothing" } });
  expect(empty.status()).toBe(422);
  expect((await empty.json()).fields.text).toBeTruthy();

  const created = await request.post("/api/v1/documents", {
    headers,
    data: { title: `Story of the ${word}`, kind: "story", date: "1989", text: `The ${word} sank.` },
  });
  expect(created.status()).toBe(201);
  const { document } = await created.json();
  expect(document).toMatchObject({
    kind: "story",
    date: { year: 1989 },
    text: `The ${word} sank.`,
  });

  const again = await request.post("/api/v1/documents", {
    headers,
    data: { title: "Same words", text: `The ${word} sank.` },
  });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ duplicate: true, document: { id: document.id } });

  const found = await (await request.get(`/api/v1/documents?q=${word}`, { headers })).json();
  expect(found.documents.map((entry: { id: string }) => entry.id)).toEqual([document.id]);
  expect(found.documents[0].excerpt).toContain(word);

  const changed = await request.patch(`/api/v1/documents/${document.id}`, {
    headers,
    data: { text: `The ${word} was raised again.` },
  });
  expect((await changed.json()).document).toMatchObject({
    title: `Story of the ${word}`,
    text: `The ${word} was raised again.`,
  });

  expect((await request.delete(`/api/v1/documents/${document.id}`, { headers })).status()).toBe(
    200,
  );
  expect((await request.get(`/api/v1/documents/${document.id}`, { headers })).status()).toBe(404);

  // The marriage licence backs the wedding date, so it stays.
  const licences = await (
    await request.get(
      `/api/v1/documents?q=${encodeURIComponent('"George Oscar Bluth"')}&kind=record`,
      {
        headers,
      },
    )
  ).json();
  const licence = licences.documents.find((entry: { title: string }) =>
    entry.title.startsWith("Marriage licence"),
  );
  const refused = await request.delete(`/api/v1/documents/${licence.id}`, { headers });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toBe("cited");
  expect((await request.get(`/api/v1/documents/${licence.id}`, { headers })).status()).toBe(200);
});
