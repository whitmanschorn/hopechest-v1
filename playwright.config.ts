import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;
const isCI = Boolean(process.env.CI);

// Specs are the source of truth for behavior: one file per feature under e2e/,
// data-testid selectors, and "@smoke" in the title of the few tests that must
// pass before anything else is worth running.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry", testIdAttribute: "data-testid" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Set PLAYWRIGHT_BASE_URL to test a deployed preview instead of a local server.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: isCI ? `npm run start -- -p ${port}` : `npm run dev -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
