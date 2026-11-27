import { defineConfig, devices } from '@playwright/test';

// The checks that need the REAL recorded runs in runs/ (not the fixtures in fixtures/runs/):
//   npm run build && npx playwright test --config playwright.recorded.config.ts
// `vite preview` serves the real build in dist/ under /haunt/ on port 3001. One worker.
// Make sure nothing else is listening on 3001 first: outside CI an existing server is reused.
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*-recorded-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL: 'http://localhost:3001/', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview',
    // HAUNT_BASE=/ points the check at a running `npm run dev` instead (same real runs).
    url: `http://localhost:3001${process.env.HAUNT_BASE ?? '/haunt/'}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
