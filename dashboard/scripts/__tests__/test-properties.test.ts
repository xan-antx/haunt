// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ViteUserConfig as UserConfig } from 'vitest/config';
import viteConfig from '../../vite.config';
import { decideExit, NO_REPORT_MESSAGE, NO_TESTS_MESSAGE } from '../test-properties';

describe('decideExit (property test runner, Req 1.9–1.11)', () => {
  it('exits 1 with the no-tests message when zero tests ran', () => {
    expect(decideExit({ numPassedTests: 0, numFailedTests: 0 }, 0)).toEqual({
      exitCode: 1,
      message: NO_TESTS_MESSAGE,
    });
    expect(NO_TESTS_MESSAGE).toMatch(/^No Property_Tests ran\./);
  });

  it('exits 1 when any test failed', () => {
    expect(decideExit({ numPassedTests: 5, numFailedTests: 1 }, 1).exitCode).toBe(1);
    // Even if Vitest somehow reported exit 0, a failure still fails the run.
    expect(decideExit({ numPassedTests: 0, numFailedTests: 2 }, 0).exitCode).toBe(1);
  });

  it('exits 0 when tests passed, none failed and Vitest exited 0', () => {
    expect(decideExit({ numPassedTests: 12, numFailedTests: 0 }, 0)).toEqual({ exitCode: 0 });
  });

  it('exits 1 when tests passed but Vitest exited non-zero or was killed by a signal', () => {
    expect(decideExit({ numPassedTests: 3, numFailedTests: 0 }, 1).exitCode).toBe(1);
    expect(decideExit({ numPassedTests: 3, numFailedTests: 0 }, null).exitCode).toBe(1);
  });

  it('exits 1 with the no-report message when the report is missing', () => {
    const expected = { exitCode: 1, message: NO_REPORT_MESSAGE };
    expect(decideExit(null, 0)).toEqual(expected);
    expect(decideExit(undefined, 1)).toEqual(expected);
    expect(NO_REPORT_MESSAGE).toBe('Vitest did not produce a report.');
  });
});

describe('Vitest config scope (Req 1.9)', () => {
  // defineConfig may be given an object or a function; resolve both forms.
  const resolved = (
    typeof viteConfig === 'function'
      ? (viteConfig as (env: { command: string; mode: string }) => UserConfig)({
          command: 'serve',
          mode: 'test',
        })
      : viteConfig
  ) as UserConfig;

  it('includes every .test/.spec TypeScript file under dashboard/', () => {
    expect(resolved.test?.include).toEqual(['**/*.{test,spec}.{ts,tsx}']);
  });

  it('excludes the Playwright e2e folder', () => {
    expect(resolved.test?.exclude).toContain('e2e/**');
  });
});
