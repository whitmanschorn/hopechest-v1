import { expect, test, type Browser, type Page } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

// Needs on-screen codes for brand-new numbers, so it cannot run against staging.
test.skip(Boolean(process.env.TEST_LOGIN_CODE), "needs on-screen codes");

/** A fictional number (555-01xx) no other run is likely to have used. */
function freshPhone() {
  const area = 200 + Math.floor(Math.random() * 800);
  const last = String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return { typed: `(${area}) 555-01${last}`, lastFour: `01${last}` };
}
const unique = (name: string) =>
  `${name} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/** As the admin, invites someone and returns the link shown for them. */
async function invite(
  page: Page,
  details: { name?: string; person?: string; email?: string; phone: string; role?: string },
) {
  await page.goto("/members");
  if (details.name) await shown(page, "invite-name").fill(details.name);
  if (details.person) {
    await shown(page, "invite-person").fill(details.person.slice(0, 8));
    await page.getByRole("option", { name: details.person }).click();
  }
  if (details.email) await shown(page, "invite-email").fill(details.email);
  await shown(page, "invite-phone").fill(details.phone);
  if (details.role) await shown(page, "invite-role").selectOption(details.role);
  await shown(page, "invite-submit").click();
  const row = shown(page, "invite-row").filter({ hasText: details.name ?? details.person! });
  await expect(row).toHaveAttribute("data-new", "true");
  return { row, link: await row.getByTestId("invite-link").inputValue() };
}

/** Opens an invite link in a browser that has never signed in, and joins. */
async function join(browser: Browser, link: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  await page.getByTestId("join-send-code").click();
  const code = await page.getByTestId("dev-code").innerText();
  await page.getByTestId("code-input").locator("input").first().click();
  await page.keyboard.type(code);
  await page.getByTestId("join-verify").click();
  await expect(page).toHaveURL(/\/welcome$/);
  return { context, page };
}

test("invite someone by name, email and mobile; they join from the link and finish their profile", async ({
  page,
  browser,
}) => {
  await signIn(page);
  await shown(page, "nav-members").click();
  await expect(shown(page, "members-title")).toBeVisible();

  const name = unique("Ann Veal");
  const phone = freshPhone();
  const { row, link } = await invite(page, { name, email: "ann@example.com", phone: phone.typed });
  expect(link).toMatch(/^http:\/\/localhost:\d+\/join\/[A-Za-z0-9_-]{40,}$/);
  await expect(row).toContainText("Invited");
  await expect(row).toContainText("ann@example.com");
  await expect(row).toContainText(phone.typed);

  // The same link is there to copy again later; nothing is regenerated.
  await page.goto("/members");
  const again = shown(page, "invite-row").filter({ hasText: name });
  await expect(again.getByTestId("invite-link")).toHaveValue(link);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await again.getByTestId("copy-invite-link").click();
  await expect(again.getByTestId("copy-invite-link")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  // The invited person, on their own device. The page already knows who they are.
  const context = await browser.newContext();
  const theirs = await context.newPage();
  await theirs.goto(link);
  await expect(theirs.getByTestId("join-title")).toHaveText(`Welcome, ${name}`);
  await expect(theirs.getByTestId("join-chest")).toContainText("Bluth family");
  await expect(theirs.getByTestId("join-phone-hint")).toHaveText(phone.lastFour);
  await theirs.getByTestId("join-send-code").click();
  await expect(theirs.getByTestId("join-code-sent")).toBeVisible();

  // A wrong code does not let them in.
  await theirs.getByTestId("code-input").locator("input").first().click();
  const code = await theirs.getByTestId("dev-code").innerText();
  await theirs.keyboard.type(code === "000000" ? "111111" : "000000");
  await theirs.getByTestId("join-verify").click();
  await expect(theirs.getByTestId("join-error")).toContainText("That code didn't work");

  await theirs.getByTestId("code-input").locator("input").first().click();
  await theirs.keyboard.type(await theirs.getByTestId("dev-code").innerText());
  await theirs.getByTestId("join-verify").click();

  // Signed in, name filled in, birthday to add.
  await expect(theirs).toHaveURL(/\/welcome$/);
  await expect(theirs.getByTestId("welcome-name")).toHaveValue(name);
  await theirs.getByTestId("welcome-born").fill("1990-06-10");
  await theirs.getByTestId("welcome-save").click();
  // Next they are offered a profile picture, which they may skip.
  await expect(theirs).toHaveURL(/\/picture\?from=welcome$/);
  await expect(theirs.getByTestId("picture-title")).toHaveText("Add a picture of yourself");
  await theirs.getByTestId("picture-skip").click();
  await expect(theirs).toHaveURL(/\/home$/);
  await theirs.getByTestId("user-menu").click();
  await expect(theirs.getByTestId("signed-in-as")).toHaveText(name);
  await theirs.keyboard.press("Escape");
  await theirs.goto("/people?q=" + encodeURIComponent(name));
  await expect(theirs.getByTestId("kin")).toHaveText("You");
  await expect(theirs.locator('[data-testid^="person-"]').first()).toContainText("b. 1990");
  await context.close();

  // For the admin they have moved from invited to member.
  await page.goto("/members");
  await expect(shown(page, "invite-row").filter({ hasText: name })).toHaveCount(0);
  const member = shown(page, "member-row").filter({ hasText: name });
  await expect(member).toContainText(phone.typed);
  await expect(member).toContainText("ann@example.com");
  await expect(member).toContainText("Add and edit");
});

test("a used link says so, and a cancelled or made-up link does not work", async ({
  page,
  browser,
}) => {
  await signIn(page);
  const used = await invite(page, { name: unique("Used Link"), phone: freshPhone().typed });
  const joined = await join(browser, used.link);
  await joined.context.close();

  const fresh = await browser.newContext();
  const visitor = await fresh.newPage();
  await visitor.goto(used.link);
  await expect(visitor.getByTestId("join-used")).toContainText("This invitation has been used");
  await expect(visitor.getByTestId("join-send-code")).toHaveCount(0);

  const cancelledName = unique("Cancelled Link");
  const cancelled = await invite(page, { name: cancelledName, phone: freshPhone().typed });
  await cancelled.row.getByTestId("revoke-invite").click();
  await expect(shown(page, "invite-row").filter({ hasText: cancelledName })).toHaveCount(0);
  await visitor.goto(cancelled.link);
  await expect(visitor.getByTestId("join-gone")).toBeVisible();
  // It gives nothing away about who was invited.
  await expect(visitor.locator("body")).not.toContainText(cancelledName);

  await visitor.goto("/join/this-link-was-never-issued-by-anyone-at-all");
  await expect(visitor.getByTestId("join-gone")).toBeVisible();
  await fresh.close();
});

test("invite someone who already has a page in the chest, as a viewer", async ({
  page,
  browser,
}) => {
  await signIn(page);
  // A person of this run's own, so seeded people stay as they are.
  const name = unique("Already Here");
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "field-born").fill("1950");
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);

  const { link } = await invite(page, { person: name, phone: freshPhone().typed, role: "VIEWER" });
  const { page: theirs, context } = await join(browser, link);
  // Their existing details are waiting for them, and a viewer may still fix their own.
  await expect(theirs.getByTestId("welcome-name")).toHaveValue(name);
  await expect(theirs.getByTestId("welcome-born")).toHaveValue("1950");
  await theirs.getByTestId("welcome-born").fill("1951-03-04");
  await theirs.getByTestId("welcome-save").click();
  // Next they are offered a profile picture, which they may skip.
  await expect(theirs).toHaveURL(/\/picture\?from=welcome$/);
  await expect(theirs.getByTestId("picture-title")).toHaveText("Add a picture of yourself");
  await theirs.getByTestId("picture-skip").click();
  await expect(theirs).toHaveURL(/\/home$/);
  await theirs.goto("/people/new");
  await expect(theirs.getByTestId("not-found-title")).toBeVisible();
  await context.close();
});

test("the invite form explains what is wrong, and refuses a member's number", async ({ page }) => {
  await signIn(page);
  await page.goto("/members");
  await shown(page, "invite-phone").fill("555");
  await shown(page, "invite-submit").click();
  const form = shown(page, "invite-form");
  await expect(form).toContainText("Give their name, or pick them from the chest.");
  await expect(form).toContainText("Enter their mobile number, with area code.");

  await shown(page, "invite-name").fill("Somebody");
  await shown(page, "invite-phone").fill(PHONES.viewer);
  await shown(page, "invite-submit").click();
  await expect(form).toContainText("Someone with this number is already a member.");
});

test("only admins can see members and invites", async ({ page }) => {
  await signIn(page, PHONES.contributor);
  await expect(shown(page, "nav-members")).toHaveCount(0);
  await page.goto("/members");
  await expect(shown(page, "not-found-title")).toBeVisible();
});
