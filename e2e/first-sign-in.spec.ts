import { expect, test, type Browser } from "@playwright/test";

// Needs on-screen codes and a number nobody has signed in with, so it cannot
// run against staging.
test.skip(Boolean(process.env.TEST_LOGIN_CODE), "needs on-screen codes");

async function signInFresh(browser: Browser, phone: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-code").click();
  const code = await page.getByTestId("dev-code").innerText();
  await page.getByTestId("code-input").locator("input").first().click();
  await page.keyboard.type(code);
  return { context, page };
}

test("two devices signing in for the first time at once both get in", async ({ browser }) => {
  // CI lists this second admin number; its account is created on first sign-in.
  const phone = process.env.E2E_FRESH_ADMIN_PHONE;
  test.skip(!phone, "set E2E_FRESH_ADMIN_PHONE to a number in ADMIN_PHONES with no account yet");

  const devices = await Promise.all([signInFresh(browser, phone!), signInFresh(browser, phone!)]);
  await Promise.all(devices.map(({ page }) => page.getByTestId("verify-code").click()));
  for (const { page, context } of devices) {
    await expect(page).toHaveURL(/\/home$/);
    await context.close();
  }
});
