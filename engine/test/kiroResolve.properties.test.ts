import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveKiroCli } from '../src/mind/ai/kiro.ts';

/**
 * Feature: listener-ai-mind, Property 10: Kiro CLI resolution order
 * **Validates: Requirements 5.2, 5.3**
 */
const RUNS = { numRuns: 100 };

const dirName = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
const posixDirs = fc.uniqueArray(dirName, { minLength: 0, maxLength: 5 }).map((names) => names.map((n) => `/opt/${n}`));
const windowsDirs = fc.uniqueArray(dirName, { minLength: 0, maxLength: 5 }).map((names) => names.map((n) => `C:\\tools\\${n}`));

describe('Feature: listener-ai-mind, Property 10: Kiro CLI resolution order', () => {
  it('posix: KIRO_CLI_PATH wins when it exists, else the first PATH entry holding kiro-cli, else install help', () => {
    fc.assert(
      fc.property(
        posixDirs,
        fc.boolean(),
        fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
        (dirs, explicitExists, flags) => {
          const holders = dirs.filter((_, i) => flags[i]);
          const files = new Set(holders.map((d) => `${d}/kiro-cli`));
          const explicit = '/custom/kiro-cli';
          if (explicitExists) files.add(explicit);
          const env = { PATH: dirs.join(':'), KIRO_CLI_PATH: explicit };

          const result = resolveKiroCli(env, (p) => files.has(p), 'linux');
          if (explicitExists) {
            expect(result).toEqual({ ok: true, path: explicit });
          } else if (holders.length > 0) {
            expect(result).toEqual({ ok: true, path: `${holders[0]}/kiro-cli` });
          } else {
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.help).toContain('KIRO_CLI_PATH');
          }
        },
      ),
      RUNS,
    );
  });

  it('windows: tries .exe then .cmd in each PATH entry, in PATH order', () => {
    fc.assert(
      fc.property(
        windowsDirs,
        fc.array(fc.constantFrom('none', 'exe', 'cmd', 'both'), { minLength: 5, maxLength: 5 }),
        (dirs, kinds) => {
          const files = new Set<string>();
          let expected: string | null = null;
          dirs.forEach((dir, i) => {
            const kind = kinds[i];
            if (kind === 'exe' || kind === 'both') files.add(`${dir}\\kiro-cli.exe`);
            if (kind === 'cmd' || kind === 'both') files.add(`${dir}\\kiro-cli.cmd`);
            if (expected === null && kind !== 'none') expected = `${dir}\\${kind === 'cmd' ? 'kiro-cli.cmd' : 'kiro-cli.exe'}`;
          });
          const result = resolveKiroCli({ Path: dirs.join(';') }, (p) => files.has(p), 'win32');
          if (expected === null) expect(result.ok).toBe(false);
          else expect(result).toEqual({ ok: true, path: expected });
        },
      ),
      RUNS,
    );
  });

  it('ignores a KIRO_CLI_PATH that does not exist and still searches PATH', () => {
    fc.assert(
      fc.property(dirName, (name) => {
        const dir = `/opt/${name}`;
        const result = resolveKiroCli({ KIRO_CLI_PATH: '/gone/kiro-cli', PATH: dir }, (p) => p === `${dir}/kiro-cli`, 'linux');
        expect(result).toEqual({ ok: true, path: `${dir}/kiro-cli` });
      }),
      RUNS,
    );
  });
});
