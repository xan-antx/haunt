import path from 'node:path';
import { defineConfig } from 'vitest/config';

const here = import.meta.dirname;

export default defineConfig({
  resolve: {
    // The Crew SDK is provided by the Crew host at run time. Tests use small stand-ins.
    alias: [
      { find: /^@kirocrew\/app-sdk\/ui$/, replacement: path.join(here, 'ui/test-support/sdkUi.tsx') },
      { find: /^@kirocrew\/app-sdk$/, replacement: path.join(here, 'ui/test-support/sdk.ts') },
    ],
  },
  test: {
    include: ['test/**/*.test.ts', 'ui/src/**/*.test.{ts,tsx}'],
  },
});
