import { expect, test } from "@playwright/test";
import { PHONES, signIn } from "./support/auth";
import { shown } from "./support/page";

test("an admin can view the chest as another family member, then stop", async ({ page }) => {
  await signIn(page);
  await page.goto("/people");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("You");
  await expect(shown(page, "add-person")).toBeVisible();

  await page.getByTestId("user-menu").click();
  await page.getByTestId("view-as").click();
  const form = page.getByTestId("view-as-form");
  await form.getByTestId("view-as-person").fill("Maeby");
  await page.getByRole("option", { name: "Maeby Fünke" }).click();
  await form.getByTestId("view-as-role").selectOption("VIEWER");
  await form.getByTestId("view-as-start").click();

  // Everything is now from Maeby's side, with a viewer's permissions.
  await expect(shown(page, "view-as-banner")).toContainText("Viewing as Maeby Fünke (view only)");
  await page.goto("/people");
  await expect(shown(page, "person-maeby").getByTestId("kin")).toHaveText("You");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("Your uncle");
  await expect(shown(page, "add-person")).toHaveCount(0);
  await page.goto("/people/new");
  await expect(shown(page, "not-found-title")).toBeVisible();

  // It lasts across pages, and the way out is always there.
  await shown(page, "view-as-stop").click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(shown(page, "view-as-banner")).toHaveCount(0);
  await page.goto("/people");
  await expect(shown(page, "person-michael").getByTestId("kin")).toHaveText("You");
  await expect(shown(page, "add-person")).toBeVisible();
});

test("viewing as someone with edit access keeps changes under the admin's own name", async ({
  page,
}) => {
  await signIn(page);
  await page.getByTestId("user-menu").click();
  await page.getByTestId("view-as").click();
  const form = page.getByTestId("view-as-form");
  await form.getByTestId("view-as-person").fill("Lindsay");
  await page.getByRole("option", { name: "Lindsay Bluth Fünke" }).click();
  await form.getByTestId("view-as-role").selectOption("CONTRIBUTOR");
  await form.getByTestId("view-as-start").click();
  await expect(shown(page, "view-as-banner")).toContainText(
    "Lindsay Bluth Fünke (can add and edit)",
  );

  const name = `View As Tester ${Date.now().toString(36)}`;
  await page.goto("/people/new");
  await shown(page, "field-displayName").fill(name);
  await shown(page, "save-person").click();
  await expect(shown(page, "person-name")).toHaveText(name);
  await shown(page, "person-history").click();
  // Recorded as Michael (the admin test account), not as Lindsay.
  await expect(shown(page, "history-entry")).toContainText("Michael Bluth");
  await shown(page, "view-as-stop").click();
});

test("only admins are offered it", async ({ page }) => {
  await signIn(page, PHONES.contributor);
  await page.getByTestId("user-menu").click();
  await expect(page.getByTestId("sign-out")).toBeVisible();
  await expect(page.getByTestId("view-as")).toHaveCount(0);
});
