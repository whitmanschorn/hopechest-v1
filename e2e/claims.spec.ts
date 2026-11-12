import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function makeKey(page: Page): Promise<string> {
  await page.goto("/settings");
  await shown(page, "api-key-name").fill(unique("Spec claims key"));
  await shown(page, "api-key-access").selectOption("write");
  await shown(page, "create-api-key").click();
  await expect(shown(page, "new-api-key")).toBeVisible();
  return shown(page, "new-api-key-value").inputValue();
}

const client = (request: APIRequestContext, key: string) => {
  const headers = { Authorization: `Bearer ${key}` };
  return {
    get: (path: string) => request.get(`/api/v1/${path}`, { headers }),
    post: (path: string, data: unknown = {}) => request.post(`/api/v1/${path}`, { headers, data }),
    delete: (path: string) => request.delete(`/api/v1/${path}`, { headers }),
  };
};

const card = (page: Page, statement: string) =>
  page
    .locator('[data-testid="claim-card"][data-ready="true"]')
    .filter({ visible: true, hasText: statement });

test("a fact read from a document waits for a person, and once accepted points back to the document", async ({
  page,
  request,
}) => {
  await signIn(page);
  const api = client(request, await makeKey(page));

  // An assistant has a marriage record, and the two people it names.
  const bride = (await (await api.post("people", { displayName: unique("Claim Bride") })).json())
    .person;
  const groom = (await (await api.post("people", { displayName: unique("Claim Groom") })).json())
    .person;
  const title = unique("Marriage record");
  const quote = `${groom.displayName} and ${bride.displayName} were joined in marriage on the 4th of June 1948.`;
  const doc = (
    await (
      await api.post("documents", { title, kind: "record", date: "1948-06-04", text: quote })
    ).json()
  ).document;

  // It may only propose changes to the family graph, and only well-formed ones.
  const statement = `${groom.displayName} and ${bride.displayName} married on 4 June 1948`;
  const wrongAction = await api.post("claims", { statement, action: "delete_event", args: {} });
  expect(wrongAction.status()).toBe(422);
  expect((await wrongAction.json()).fields.action).toBeTruthy();
  const wrongArgs = await api.post("claims", {
    statement,
    action: "add_event",
    args: { kind: "wedding", title: "x", participants: [] },
  });
  expect((await wrongArgs.json()).fields.args).toContain("kind");

  const args = {
    kind: "marriage",
    title: unique("Claim wedding"),
    date: "1948-06-04",
    participants: [{ person: groom.slug }, { person: bride.slug }],
  };
  const proposed = await api.post("claims", {
    statement,
    action: "add_event",
    args,
    document: doc.id,
    quote,
    confidence: 0.9,
    agent: "spec-model",
  });
  expect(proposed.status()).toBe(201);
  const claim = (await proposed.json()).claim;
  expect(claim).toMatchObject({ status: "proposed", proposedBy: "spec-model", quote });

  // Proposing changes nothing: the bride has no events yet.
  expect((await (await api.get(`people/${bride.slug}`)).json()).person.events).toEqual([]);

  // A person finds it under Review, with the words it was read from.
  await page.goto("/review");
  await expect(shown(page, "review-tab-facts")).toContainText(/Proposed facts \(\d+\)/);
  await shown(page, "review-tab-facts").click();
  await expect(shown(page, "facts-title")).toBeVisible();
  const waiting = card(page, statement);
  await expect(waiting.getByTestId("claim-quote")).toHaveText(quote);
  await expect(waiting.getByTestId("claim-args")).toContainText("Kind: marriage");
  await expect(waiting.getByTestId("claim-args")).toContainText(
    `People: ${groom.slug}, ${bride.slug}`,
  );
  await expect(waiting.getByTestId("claim-origin")).toContainText("proposed by spec-model");
  await expect(waiting.getByTestId("claim-source")).toHaveText(title);

  await waiting.getByTestId("claim-accept").click();
  await expect(card(page, statement)).toHaveCount(0);

  // The event exists now, and names the record as its source.
  await shown(page, "facts-accepted").click();
  await card(page, statement).getByTestId("claim-applied").click();
  await expect(shown(page, "event-title")).toHaveText(args.title);
  await expect(shown(page, "event-date")).toHaveText("June 4, 1948");
  await expect(shown(page, "event-source")).toHaveText(title);

  // It cannot be decided twice, and the record can no longer be deleted.
  const again = await api.post(`claims/${claim.id}/accept`);
  expect(again.status()).toBe(409);
  expect((await api.delete(`documents/${doc.id}`)).status()).toBe(409);
});

test("a proposal that cannot be carried out stays in the queue, and can be rejected with a reason", async ({
  page,
  request,
}) => {
  await signIn(page);
  const api = client(request, await makeKey(page));
  const statement = unique("Nobody moved to Sudden Valley");
  const proposed = await api.post("claims", {
    statement,
    action: "add_event",
    args: { kind: "move", title: statement, participants: [{ person: "nobody-by-this-name" }] },
  });
  const claim = (await proposed.json()).claim;
  expect(claim.source).toBeNull();

  await page.goto("/review/facts");
  const waiting = card(page, statement);
  await expect(waiting.getByTestId("claim-origin")).toContainText("No source given");
  await waiting.getByTestId("claim-accept").click();
  await expect(waiting.getByTestId("claim-problem")).toBeVisible();
  await expect(waiting.getByTestId("claim-accept")).toBeVisible();

  await waiting.getByTestId("claim-reject").click();
  await waiting.getByTestId("claim-reject-note").fill("No such person.");
  await waiting.getByTestId("claim-reject-confirm").click();
  await expect(card(page, statement)).toHaveCount(0);

  await shown(page, "facts-rejected").click();
  await expect(card(page, statement).getByTestId("claim-origin")).toContainText("No such person.");
  const listed = await (await api.get("claims?status=rejected")).json();
  expect(listed.claims.find((entry: { id: string }) => entry.id === claim.id)).toMatchObject({
    status: "rejected",
    reviewNote: "No such person.",
    applied: null,
  });
});

test("proposed facts are only for people who can add things @smoke", async ({ page, request }) => {
  expect((await request.get("/api/v1/claims")).status()).toBe(401);
  await signIn(page, PHONES.viewer);
  await page.goto("/review/facts");
  await expect(page.getByTestId("facts-title")).toHaveCount(0);
});
