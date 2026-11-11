import { expect, test } from "@playwright/test";

test("welcome page names the chest @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-title")).toHaveText("Hopechest");
  await expect(page.getByTestId("chest-name")).toHaveText("Bluth family");
});
