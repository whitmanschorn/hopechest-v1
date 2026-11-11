import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";

test("the signed-in shell shows the chest, navigation and account menu @smoke", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByTestId("chest-title")).toHaveText("Bluth family");
  await expect(page.getByTestId("nav-home")).toHaveAttribute("data-active", "true");
  await page.getByTestId("user-menu").click();
  await expect(page.getByTestId("sign-out")).toBeVisible();
});

test("navigation collapses behind a menu button on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByTestId("nav-home")).not.toBeInViewport();
  await page.getByTestId("nav-burger").click();
  await expect(page.getByTestId("nav-home")).toBeInViewport();
  await page.getByTestId("nav-home").click();
  await expect(page.getByTestId("nav-home")).not.toBeInViewport();
});

test("an unknown page inside the chest says so", async ({ page }) => {
  await signIn(page);
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("not-found-title")).toBeVisible();
});
