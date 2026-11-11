import { expect, test } from "@playwright/test";

test("the app reaches a migrated database @smoke", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.migrations).toBeGreaterThan(0);
});
