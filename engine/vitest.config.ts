import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'test-output/**'],
    env: { HAUNT_UNDER_TEST: '1' },
    passWithNoTests: true,
    // Several test files launch Chromium at the same time. Closing a browser can take longer than the
    // 10 s default hook timeout while the others are starting up.
    hookTimeout: 60_000,
    // The same contention slows the CPU-heavy property tests past the 5 s default.
    testTimeout: 60_000,
  },
});
