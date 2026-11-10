import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    env: { HAUNT_UNDER_TEST: '1' },
    fileParallelism: false,
    testTimeout: 1_800_000,
    hookTimeout: 180_000,
    passWithNoTests: true,
  },
});
