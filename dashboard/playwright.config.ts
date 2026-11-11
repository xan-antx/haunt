import { defineConfig, devices } from '@playwright/test';

// End-to-end checks against a build of the fixed test runs in fixtures/runs/ (not runs/), served by
// `npm run preview:e2e` on port 3001, so new real runs never change what the suite sees.
// The build lives under /haunt/, so the specs open /haunt/#/... paths.
// Make sure nothing else is listening on 3001 first: outside CI an existing server is reused.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Three workers locally keeps the machine responsive; CI uses Playwright's default.
  workers: process.env.CI ? undefined : 3,
  retries: 0,
  // The first tests also pay for cold browser start-up, which can take over 30 s on Windows.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://localhost:3001/haunt/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
