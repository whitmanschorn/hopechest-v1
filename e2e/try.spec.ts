import { expect, test, type Page } from "@playwright/test";
import { shown } from "./support/page";

const PASSWORD = process.env.DEMO_PASSWORD ?? "local-demo-password";

async function enterAs(page: Page, name: string, role: "CONTRIBUTOR" | "VIEWER") {
  await page.goto("/try");
  await page.getByTestId("demo-password").fill(PASSWORD);
  await page.getByTestId("demo-unlock").click();
  await page.getByTestId("demo-person").fill(name.slice(0, 6));
  await page.getByRole("option", { name }).click();
  await page.getByTestId("demo-role").selectOption(role);
  await page.getByTestId("demo-start").click();
  await expect(page).toHaveURL(/\/home$/);
}

test("with the demo password, look around as any family member without signing in first", async ({
  page,
}) => {
  await enterAs(page, "Maeby Fünke", "VIEWER");

  // The whole session is Maeby's: her name, her relatives, her permissions.
  await page.getByTestId("user-menu").click();
  await expect(page.getByTestId("signed-in-as")).toHaveText("Maeby Fünke");
  await expect(page.getByTestId("role-badge")).toHaveText(/viewer/i);
  await page.keyboard.press("Escape");
  await page.goto("/people");
  await expect(shown(page, "person-maeby").getByTestId("kin")).toHaveText("You");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("Your uncle");
  await expect(shown(page, "add-person")).toHaveCount(0);

  // Signing out ends it like any other session.
  await page.getByTestId("user-menu").click();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/people");
  await expect(page).toHaveURL(/\/login$/);
});

test("a demo visitor who can edit leaves changes marked as a demo visitor's", async ({ page }) => {
  await enterAs(page, "Lindsay Bluth Fünke", "CONTRIBUTOR");
  const name = `Demo Tester ${Date.now().toString(36)}`;
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  await shown(page, "person-history").click();
  await expect(shown(page, "history-entry")).toContainText("A demo visitor");
});

test("the wrong password shows no names and opens nothing", async ({ page }) => {
  await page.goto("/try");
  await page.getByTestId("demo-password").fill("not-the-password-at-all");
  await page.getByTestId("demo-unlock").click();
  await expect(page.getByTestId("demo-password-form")).toContainText("That password didn't work.");
  await expect(page.getByTestId("demo-person")).toHaveCount(0);
  await page.goto("/people");
  await expect(page).toHaveURL(/\/login$/);
});

test("there is no way to choose full admin access", async ({ page }) => {
  await page.goto("/try");
  await page.getByTestId("demo-password").fill(PASSWORD);
  await page.getByTestId("demo-unlock").click();
  await expect(page.getByTestId("demo-role").locator("option")).toHaveText([
    "Add and edit",
    "Look only",
  ]);
});
