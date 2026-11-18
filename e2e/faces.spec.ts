import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { signIn } from "./support/auth";
import { hopechest } from "./support/cli";
import { testJpeg } from "./support/images";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page, access: "read" | "ingest"): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique(`Spec faces ${access} key`));
  await shown(page, "api-key-access").selectOption(access);
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

function client(request: APIRequestContext, key: string) {
  const headers = { Authorization: `Bearer ${key}` };
  return {
    get: (path: string) => request.get(`/api/v1/${path}`, { headers }),
    post: (path: string, data: unknown) => request.post(`/api/v1/${path}`, { headers, data }),
  };
}

/**
 * The numbers for a face nobody else has: far from every real face and from
 * every other run of this spec. The model itself never runs here; what the
 * chest does with its numbers is what is under test.
 */
const someone = () => Array.from({ length: 128 }, () => (Math.random() * 2 - 1) * 8);
/** The same person in another photo: nearly the same numbers. */
const again = (face: number[]) => face.map((n) => n + (Math.random() * 2 - 1) * 0.01);
const LEFT = { x: 10, y: 10, w: 20, h: 30 };
const RIGHT = { x: 60, y: 10, w: 20, h: 30 };

/** Brings in `count` published photos and gives back their ids, in no particular order. */
async function publishedPhotos(
  api: ReturnType<typeof client>,
  baseURL: string,
  key: string,
  folder: string,
  count: number,
): Promise<string[]> {
  mkdirSync(folder, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    writeFileSync(join(folder, `face-${index}.jpg`), (await testJpeg()).buffer);
  }
  const run = await hopechest(baseURL, key, "ingest", folder, "--label", unique("Faces"));
  expect(run.json).toMatchObject({ added: count });
  const batchId: string = run.json.batch.id;
  const batch = await (await api.get(`ingest/batches/${batchId}`)).json();
  const ids: string[] = batch.batch.waiting.map((photo: { id: string }) => photo.id);
  expect(ids).toHaveLength(count);
  expect((await api.post(`ingest/batches/${batchId}/publish`, {})).ok()).toBe(true);
  return ids;
}

/** Takes this spec's leftover faces out of the queue, so it holds only real ones. */
async function setAside(api: ReturnType<typeof client>, photos: string[]) {
  for (const photo of photos) {
    const queue = await (await api.get(`faces?photo=${photo}`)).json();
    const faces = queue.groups.flatMap((entry: { faces: { id: string }[] }) =>
      entry.faces.map((face) => face.id),
    );
    if (faces.length > 0) await api.post("faces/ignore", { faces });
  }
}

const group = (page: Page, faceOrPhoto: { photo: string }) =>
  shown(page, "face-group").filter({
    has: page.locator(`[data-testid="face-tile"][data-photo="${faceOrPhoto.photo}"]`),
  });

test("faces are grouped, named once, and then recognised in other photos @smoke", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  await signIn(page);
  const key = await makeKey(page, "ingest");
  const api = client(request, key);
  const [first, second, third] = await publishedPhotos(
    api,
    baseURL!,
    key,
    testInfo.outputPath("faces"),
    3,
  );
  const name = unique("Stan Sitwell");
  const made = await (await api.post("people", { displayName: name })).json();
  const slug: string = made.person.slug;

  // A scan reports the same stranger in all three photos, and someone else in the third.
  const { model } = await (await api.get("faces/unscanned?limit=1")).json();
  const stranger = someone();
  for (const photo of [first, second]) {
    const stored = await api.post(`photos/${photo}/faces`, {
      model,
      faces: [{ box: LEFT, score: 0.99, embedding: again(stranger) }],
    });
    expect(await stored.json()).toEqual({ faces: 1, linked: 0 });
  }
  await api.post(`photos/${third}/faces`, {
    model,
    faces: [
      { box: LEFT, score: 0.98, embedding: again(stranger) },
      { box: RIGHT, score: 0.97, embedding: someone() },
    ],
  });

  // The API groups the three sightings as one person, with no guess yet.
  const queue = await (await api.get("faces")).json();
  const theirs = queue.groups.find((entry: { faces: { photoId: string }[] }) =>
    entry.faces.some((face) => face.photoId === first),
  );
  expect(theirs).toMatchObject({ size: 3, suggestion: null });

  // On the first photo's page there is a face to name.
  await page.goto(`/photos/${first}`);
  await expect(shown(page, "photo-unnamed-faces")).toContainText("a face in this photo");
  await shown(page, "photo-unnamed-faces").getByRole("link").click();
  await expect(shown(page, "faces-one-photo")).toBeVisible();
  const card = group(page, { photo: first });
  await expect(card).toHaveAttribute("data-ready", "true");
  await expect(card.getByTestId("face-group-size")).toHaveText("1 face");
  await expect(card.getByTestId("face-suggestion")).toHaveCount(0);
  await card.getByTestId("face-person").fill(name);
  await page.getByRole("option", { name }).click();
  await card.getByTestId("face-name").click();
  await expect(shown(page, "faces-empty")).toContainText("No unnamed faces in this photo");

  // Naming made a tag, placed where the face is.
  await page.goto(`/photos/${first}`);
  await expect(shown(page, "photo-stage")).toContainText(name);
  await expect(shown(page, "photo-unnamed-faces")).toHaveCount(0);
  const tagged = await (await api.get(`photos/${first}`)).json();
  expect(tagged.photo.people).toEqual([{ slug, displayName: name, box: LEFT }]);

  // The same face in the second photo now comes with a guess: one click names it.
  await page.goto(`/review/faces?photo=${second}`);
  const next = group(page, { photo: second });
  await expect(next).toHaveAttribute("data-ready", "true");
  await expect(next.getByTestId("face-suggestion")).toContainText(`Looks like ${name}`);
  await next.getByTestId("face-yes").click();
  await expect(shown(page, "faces-empty")).toBeVisible();

  // In the third photo the guess is refused: the face stays, and the guess is not made again.
  await page.goto(`/review/faces?photo=${third}`);
  await expect(shown(page, "face-group")).toHaveCount(2);
  const refused = shown(page, "face-group").filter({ has: page.getByTestId("face-suggestion") });
  await expect(refused).toHaveAttribute("data-ready", "true");
  await refused.getByTestId("face-no").click();
  await expect(shown(page, "face-suggestion")).toHaveCount(0);
  await expect(shown(page, "face-group")).toHaveCount(2);

  // The other face is nobody the family needs to name.
  await shown(page, "face-group").first().getByTestId("face-ignore").click();
  await expect(shown(page, "face-group")).toHaveCount(1);

  // Untagging someone takes their name off the face, and it is not offered again.
  const untag = await request.patch(`/api/v1/photos/${second}`, {
    headers: { Authorization: `Bearer ${key}` },
    data: { people: [] },
  });
  expect(untag.ok()).toBe(true);
  await page.goto(`/review/faces?photo=${second}`);
  await expect(shown(page, "face-group")).toHaveCount(1);
  await expect(shown(page, "face-suggestion")).toHaveCount(0);
  await setAside(api, [first, second, third]);
});

test("a second scan keeps what people decided, and a hand-drawn box names a face", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  await signIn(page);
  const key = await makeKey(page, "ingest");
  const api = client(request, key);
  const [photo] = await publishedPhotos(api, baseURL!, key, testInfo.outputPath("rescan"), 1);
  const made = await (await api.post("people", { displayName: unique("Sally Sitwell") })).json();
  const slug: string = made.person.slug;
  const { model } = await (await api.get("faces/unscanned?limit=1")).json();
  const left = someone();
  const right = someone();
  const scan = () =>
    api.post(`photos/${photo}/faces`, {
      model,
      faces: [
        { box: LEFT, score: 0.9, embedding: again(left) },
        { box: RIGHT, score: 0.9, embedding: again(right) },
      ],
    });
  const waiting = async () =>
    (await (await api.get(`faces?photo=${photo}`)).json()).groups.flatMap(
      (entry: { faces: { id: string }[] }) => entry.faces.map((face) => face.id),
    ) as string[];

  await scan();
  const [one, other] = await waiting();
  expect(await (await api.post("faces/name", { faces: [one], person: slug })).json()).toEqual({
    named: 1,
  });
  expect(await (await api.post("faces/ignore", { faces: [other] })).json()).toEqual({
    ignored: 1,
  });
  expect(await waiting()).toEqual([]);

  // Scanned again, the named face is still named and the one set aside stays aside.
  expect(await (await scan()).json()).toEqual({ faces: 2, linked: 0 });
  expect(await waiting()).toEqual([]);
  expect((await (await api.get(`photos/${photo}`)).json()).photo.people).toHaveLength(1);

  // A photo where someone already drew a box: the face under it takes that name.
  const [drawn] = await publishedPhotos(api, baseURL!, key, testInfo.outputPath("drawn"), 1);
  await request.patch(`/api/v1/photos/${drawn}`, {
    headers: { Authorization: `Bearer ${key}` },
    data: { people: [slug] },
  });
  await page.goto(`/photos/${drawn}`);
  await expect(shown(page, "face-tools")).toHaveAttribute("data-ready", "true");
  await shown(page, `mark-${slug}`).click();
  const image = await shown(page, "photo-image").boundingBox();
  await page.mouse.move(image!.x + image!.width * 0.12, image!.y + image!.height * 0.12);
  await page.mouse.down();
  await page.mouse.move(image!.x + image!.width * 0.3, image!.y + image!.height * 0.4, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(shown(page, "face-box")).toHaveCount(1);
  const stored = await api.post(`photos/${drawn}/faces`, {
    model,
    faces: [
      { box: LEFT, score: 0.9, embedding: someone() },
      { box: RIGHT, score: 0.9, embedding: someone() },
    ],
  });
  expect(await stored.json()).toEqual({ faces: 2, linked: 1 });
  const leftOver = await (await api.get(`faces?photo=${drawn}`)).json();
  expect(leftOver.waiting).toBe(1);
  await setAside(api, [drawn]);
});

test("the chest refuses faces it cannot use, and keys that may not send them", async ({
  page,
  request,
}) => {
  await signIn(page);
  const reader = client(request, await makeKey(page, "read"));
  expect((await reader.get("faces/unscanned")).status()).toBe(403);
  expect((await reader.get("faces")).status()).toBe(403);

  const api = client(request, await makeKey(page, "ingest"));
  const { model, photos } = await (await api.get("faces/unscanned?limit=1")).json();
  expect(typeof model).toBe("string");
  const nowhere = "00000000-0000-4000-8000-000000000000";
  const face = { box: LEFT, score: 0.9, embedding: someone() };

  const other = await api.post(`photos/${nowhere}/faces`, { model: "another-model", faces: [] });
  expect(other.status()).toBe(422);
  expect((await other.json()).message).toContain(model);
  const short = await api.post(`photos/${nowhere}/faces`, {
    model,
    faces: [{ ...face, embedding: face.embedding.slice(1) }],
  });
  expect(short.status()).toBe(422);
  const outside = await api.post(`photos/${nowhere}/faces`, {
    model,
    faces: [{ ...face, box: { x: 90, y: 10, w: 20, h: 30 } }],
  });
  expect(outside.status()).toBe(422);
  expect((await api.post(`photos/${nowhere}/faces`, { model, faces: [face] })).status()).toBe(404);

  expect((await api.post("faces/name", { faces: [], person: "michael" })).status()).toBe(422);
  expect((await api.post("faces/name", { faces: [nowhere], person: "nobody-here" })).status()).toBe(
    422,
  );
  // A photo's files are readable with a key, which is how the scan sees them.
  if (photos.length > 0) {
    const file = await request.get(photos[0].imageUrl, {
      headers: { Authorization: "Bearer hc_no" },
    });
    expect(file.status()).toBe(401);
  }
});

test("scan-faces looks over photos with the real model and marks them done", async ({
  page,
  request,
  baseURL,
}, testInfo) => {
  test.slow();
  await signIn(page);
  const key = await makeKey(page, "ingest");
  const api = client(request, key);
  const [photo] = await publishedPhotos(api, baseURL!, key, testInfo.outputPath("scan"), 1);

  // Only its own photo: other specs' photos carry made-up faces a real scan would replace.
  const before = await (await api.get("faces/unscanned?limit=200")).json();
  expect(before.photos.map((entry: { id: string }) => entry.id)).toContain(photo);
  const run = await hopechest(baseURL!, key, "scan-faces", `photo=${photo}`);
  expect(run.stderr).toContain("Loading the face model");
  expect(run.code).toBe(0);
  expect(run.json).toMatchObject({
    scanned: 1,
    named: 0,
    failed: [],
    review: `${baseURL}/review/faces`,
  });

  // It is marked as looked over, so a later run does not ask for it again.
  const after = await (await api.get("faces/unscanned?limit=200")).json();
  expect(after.photos.map((entry: { id: string }) => entry.id)).not.toContain(photo);

  const usage = await hopechest(baseURL!, key, "scan-faces", "everything");
  expect(usage.code).toBe(2);
});
