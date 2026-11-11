import { expect, test, type Page } from "@playwright/test";

// 555-01xx numbers are reserved for fiction: the app shows their codes on
// screen instead of texting, outside production only.
// CI and .env.example list ADMIN as an admin through ADMIN_PHONES.
const ADMIN = "(202) 555-0101";
const STRANGER = "(202) 555-0199";

async function requestCode(page: Page, phone: string) {
  await page.goto("/login");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-code").click();
  await expect(page.getByTestId("code-sent")).toBeVisible();
}

async function enterCode(page: Page, code: string) {
  await page.getByTestId("code-input").locator("input").first().click();
  await page.keyboard.type(code);
  await page.getByTestId("verify-code").click();
}

test("signed-out visitors are sent to sign in @smoke", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});

test("a member signs in with a texted code, then signs out @smoke", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sign-in-link").click();
  await expect(page).toHaveURL(/\/login$/);

  await requestCode(page, ADMIN);
  // Staging never shows codes; its test numbers use a secret one.
  const code = process.env.TEST_LOGIN_CODE ?? (await page.getByTestId("dev-code").innerText());
  expect(code).toMatch(/^\d{6}$/);
  await enterCode(page, code);

  await expect(page).toHaveURL(/\/home$/);
  await page.getByTestId("user-menu").click();
  await expect(page.getByTestId("signed-in-as")).toContainText("0101");
  await expect(page.getByTestId("role-badge")).toHaveText(/admin/i);

  // The session survives a reload.
  await page.reload();
  await expect(page.getByTestId("home-title")).toBeVisible();

  await page.getByTestId("user-menu").click();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});

test("a wrong code is refused", async ({ page }) => {
  test.skip(
    Boolean(process.env.TEST_LOGIN_CODE),
    "needs on-screen codes; would use up staging's guess limit",
  );
  await requestCode(page, ADMIN);
  const code = await page.getByTestId("dev-code").innerText();
  const wrong = code === "000000" ? "111111" : "000000";
  await enterCode(page, wrong);
  await expect(page.getByTestId("code-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("a number that is not in the chest gets no code and cannot sign in", async ({ page }) => {
  test.skip(Boolean(process.env.TEST_LOGIN_CODE), "would use up staging's guess limit");
  await requestCode(page, STRANGER);
  // Same screen as for a member, so the form does not reveal who belongs.
  await expect(page.getByTestId("dev-code")).toHaveCount(0);
  await enterCode(page, "123456");
  await expect(page.getByTestId("code-error")).toBeVisible();
});

test("something that is not a phone number is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("phone-input").fill("555-0101");
  await page.getByTestId("send-code").click();
  await expect(page.getByText("Enter a mobile number, with area code.")).toBeVisible();
});

test("a made-up session cookie does not get in", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "hopechest_session", value: "forged", url: baseURL! }]);
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/);
});
