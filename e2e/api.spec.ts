import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** Makes a key on the Settings page (signed in as the admin) and returns it. */
async function makeKey(
  page: Page,
  access: "read" | "write" | "ingest",
): Promise<{ key: string; name: string }> {
  const name = unique(`Spec ${access} key`);
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(name);
  await shown(page, "api-key-access").selectOption(access);
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toContainText(name);
  const key = await shown(page, "new-api-key-value").inputValue();
  expect(key).toMatch(/^hc_[A-Za-z0-9_-]{43}$/);
  return { key, name };
}

/** Calls the API with a key. */
const client = (request: APIRequestContext, key: string) => {
  const headers = { Authorization: `Bearer ${key}` };
  return {
    get: (path: string) => request.get(`/api/v1/${path}`, { headers }),
    post: (path: string, data: unknown) => request.post(`/api/v1/${path}`, { headers, data }),
    patch: (path: string, data: unknown) => request.patch(`/api/v1/${path}`, { headers, data }),
    delete: (path: string) => request.delete(`/api/v1/${path}`, { headers }),
  };
};

test("the API turns away a request with no key @smoke", async ({ request }) => {
  const response = await request.get("/api/v1/people");
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toBe("unauthorized");
  const wrong = await request.get("/api/v1", {
    headers: { Authorization: "Bearer hc_not-a-real-key" },
  });
  expect(wrong.status()).toBe(401);
});

test("a read-only key answers the marriage question, cannot change anything, and stops when revoked", async ({
  page,
  request,
}) => {
  await signIn(page);
  const { key, name } = await makeKey(page, "read");
  const api = client(request, key);

  // The API describes itself, including what this key may not do.
  const index = await (await api.get("")).json();
  expect(index.chest.slug).toBe("bluth");
  expect(index.caller).toEqual({ kind: "apiKey", scopes: ["read"] });
  const route = (method: string, path: string) =>
    index.routes.find(
      (entry: { method: string; path: string }) => entry.method === method && entry.path === path,
    );
  expect(route("GET", "/api/v1/people").allowed).toBe(true);
  expect(route("POST", "/api/v1/people").allowed).toBe(false);

  const { people } = await (await api.get("people?q=lucille")).json();
  expect(people.map((person: { slug: string }) => person.slug)).toContain("lucille");

  // When were George Sr. and Lucille married, and how do we know?
  const { events } = await (await api.get("events?kind=marriage&person=lucille")).json();
  const wedding = events.find((event: { participants: { slug: string }[] }) =>
    event.participants.some((participant) => participant.slug === "george-sr"),
  );
  expect(wedding.date).toMatchObject({ year: 1965, month: 2, day: 13, precision: "day" });
  const detail = await (await api.get(`events/${wedding.id}`)).json();
  expect(detail.sources[0].citation).toContain("Marriage licence and certificate");

  // Reading only.
  const refused = await api.post("people", { displayName: "Should Not Exist" });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error).toBe("forbidden");
  expect((await api.delete(`events/${wedding.id}`)).status()).toBe(403);

  // The Settings page shows it has been used; revoking it stops it at once.
  await page.reload();
  const row = shown(page, "api-key").filter({ hasText: name });
  await expect(row).toContainText("Read only");
  await expect(row).toContainText("Last used");
  await expect(row).not.toContainText(key);
  await row.getByTestId("revoke-api-key").click();
  await expect(row).toHaveAttribute("data-revoked", "true");
  expect((await api.get("people")).status()).toBe(401);
});

test("a key that can change things adds people, a marriage, a place and an album", async ({
  page,
  request,
}) => {
  await signIn(page);
  const { key, name: keyName } = await makeKey(page, "write");
  const api = client(request, key);

  // Two people, the second added as the first one's partner.
  const firstName = unique("Api Bride");
  const created = await api.post("people", {
    displayName: firstName,
    nicknames: ["Bee", "B"],
    born: "around 1940",
    living: false,
  });
  expect(created.status()).toBe(201);
  const first = (await created.json()).person;
  expect(first.values.nicknames).toEqual(["Bee", "B"]);
  expect(first.values.born).toMatchObject({ year: 1940, precision: "circa" });
  expect(first.values.isLiving).toBe(false);

  const second = (
    await (
      await api.post("people", {
        displayName: unique("Api Groom"),
        relation: { role: "partner", other: first.slug, qualifier: "married" },
      })
    ).json()
  ).person;
  expect(second.partners.map((partner: { slug: string }) => partner.slug)).toEqual([first.slug]);

  // A change touches only the fields sent, and a bad one says which field.
  const changed = await api.patch(`people/${first.slug}`, { notes: "Added by a program." });
  expect((await changed.json()).person.values).toMatchObject({
    notes: "Added by a program.",
    nicknames: ["Bee", "B"],
  });
  const bad = await api.patch(`people/${first.slug}`, { born: "a while ago" });
  expect(bad.status()).toBe(422);
  expect((await bad.json()).fields.born).toBeTruthy();

  // The history names the key, not a person.
  const history = await (await api.get(`people/${first.slug}/history`)).json();
  expect(history.entries[0].by).toBe(`${keyName} (API key)`);

  // A place, and their wedding there, with the date worked out rather than recorded.
  const place = (
    await (await api.post("places", { label: unique("Api Chapel"), city: "Reno" })).json()
  ).place;
  expect(place.values.city).toBe("Reno");
  const lonely = await api.post("events", {
    kind: "marriage",
    title: "A wedding of one",
    participants: [{ person: first.slug }],
  });
  expect(lonely.status()).toBe(422);
  const wed = await api.post("events", {
    kind: "marriage",
    title: "Api wedding",
    date: "1962",
    deduced: true,
    clue: "Two years before their first child",
    place: place.slug,
    participants: [{ person: first.slug }, { person: second.slug }],
  });
  expect(wed.status()).toBe(201);
  const event = (await wed.json()).event;
  expect(event.date).toMatchObject({ year: 1962, deduced: true });
  expect(event.place.slug).toBe(place.slug);
  expect(event.participants).toHaveLength(2);

  // Finding the licence settles it: an exact date, no longer deduced.
  const settled = (
    await (await api.patch(`events/${event.id}`, { date: "1962-06-09", deduced: false })).json()
  ).event;
  expect(settled.date).toMatchObject({ year: 1962, month: 6, day: 9, precision: "day" });
  expect(settled.date.deduced ?? false).toBe(false);
  expect(settled.participants).toHaveLength(2);

  // The website shows what the program did.
  await page.goto(`/people/${first.slug}`);
  await expect(shown(page, "person-name")).toHaveText(firstName);
  await expect(shown(page, "person-event-link").filter({ hasText: "Api wedding" })).toBeVisible();

  // Albums, then tidying up.
  const album = (await (await api.post("albums", { title: unique("Api album") })).json()).album;
  const renamed = await api.patch(`albums/${album.id}`, { description: "Made by a program." });
  expect((await renamed.json()).album).toMatchObject({
    title: album.title,
    description: "Made by a program.",
  });
  expect((await api.delete(`albums/${album.id}`)).status()).toBe(200);
  expect((await api.get(`albums/${album.id}`)).status()).toBe(404);
  expect((await api.delete(`events/${event.id}`)).status()).toBe(200);
  expect((await api.delete(`places/${place.slug}`)).status()).toBe(200);
  const link = second.partners[0].relationshipId;
  expect((await api.delete(`relationships/${link}`)).status()).toBe(200);
  expect((await (await api.get(`people/${second.slug}`)).json()).person.partners).toEqual([]);

  // Wrong turns get a plain answer.
  expect((await api.get("nothing-here")).status()).toBe(404);
  expect((await api.delete("people")).status()).toBe(405);
  const garbled = await request.post("/api/v1/places", {
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    data: Buffer.from("{not json"),
  });
  expect(garbled.status()).toBe(400);
});

test("only admins see Settings; a signed-in member can read the API but is held to their role", async ({
  page,
}) => {
  await signIn(page, PHONES.viewer);
  await expect(page.getByTestId("nav-settings")).toHaveCount(0);
  await page.goto("/settings");
  await expect(shown(page, "not-found-title")).toBeVisible();

  // The browser's own session works for looking around the API.
  const people = await page.request.get("/api/v1/people");
  expect(people.status()).toBe(200);
  const refused = await page.request.post("/api/v1/places", { data: { label: "Nowhere" } });
  expect(refused.status()).toBe(403);
});
