import { defineConfig, devices } from "@playwright/test";

/**
 * Runs the birthday scenario against a deployed site with disposable test accounts:
 *   E2E_BASE_URL=https://tavalod.example.com E2E_LINKS_FILE=<links.tsv> E2E_SCREENSHOTS_DIR=docs/screenshots \
 *     npx playwright test -c playwright.prod.config.ts
 * links.tsv comes from scripts/issue-login.mjs with names ali, sara, reza, mina. Clean the test data up afterwards.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /birthday\.spec\.ts/,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    ...devices["Pixel 7"],
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  },
});
