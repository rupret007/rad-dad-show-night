import { defineConfig, devices } from "@playwright/test";
import { OFFLINE_ORIGIN } from "./tests/browser/fixture-origin";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: "list",
  outputDir: "test-results/browser",
  use: {
    baseURL: OFFLINE_ORIGIN,
    serviceWorkers: "block",
    locale: "en-US",
    timezoneId: "America/Chicago",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx vite --config tests/browser/vite.config.ts",
    url: OFFLINE_ORIGIN,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
