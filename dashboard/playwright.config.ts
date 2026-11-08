import { defineConfig, devices } from '@playwright/test';

// End-to-end checks against the built site served by `npm run preview` on port 3001.
// The production build lives under /haunt/, so the specs open /haunt/#/... paths.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
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
    command: 'npm run build && npm run preview',
    url: 'http://localhost:3001/haunt/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
