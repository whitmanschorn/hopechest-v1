import { expect, test } from "@playwright/test";
import { signIn } from "./support/auth";

test("home shows how much the chest holds @smoke", async ({ page }) => {
  await signIn(page);
  // The Bluth seed is the floor; other specs may add to it.
  const floor = { people: 14, events: 20, places: 9, documents: 40 };
  for (const [key, least] of Object.entries(floor)) {
    const shown = await page.getByTestId(`home-count-${key}`).innerText();
    expect(Number(shown.replace(/,/g, "")), key).toBeGreaterThanOrEqual(least);
  }
});
