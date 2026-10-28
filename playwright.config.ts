import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for signed-in flows. They run against a production build of
// the app (started automatically on E2E_PORT) and the Supabase project in
// .env.local, with throwaway users created and deleted by tests/e2e/fixtures.ts.
// Set E2E_BASE_URL to test an already running server instead.
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // One worker: the suite shares one live project and its rate limits.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    locale: "en-US",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // A fake microphone (test tone) so the real recording flow can run.
          args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
        },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
