import { expect, type Page } from "@playwright/test";

/** Test numbers (555-01xx). Their codes are shown on screen outside production. */
export const PHONES = {
  /** Listed in ADMIN_PHONES for CI and local development. */
  admin: "(202) 555-0101",
  /** Not a member of any chest. */
  stranger: "(202) 555-0199",
} as const;

/** Signs in through the real login form. */
export async function signIn(page: Page, phone: string = PHONES.admin): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("phone-input").fill(phone);
  await page.getByTestId("send-code").click();
  // Against staging, test numbers use a secret code instead of an on-screen one.
  await expect(page.getByTestId("code-sent")).toBeVisible();
  const code = process.env.TEST_LOGIN_CODE ?? (await page.getByTestId("dev-code").innerText());
  await page.getByTestId("code-input").locator("input").first().click();
  await page.keyboard.type(code);
  await page.getByTestId("verify-code").click();
  await expect(page).toHaveURL(/\/home$/);
}
