import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { interpretExit } from '../src/ghosts.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { RUNS, harness, savedResult } from './helpers.ts';

describe('Feature: haunt-patrol, Property 4 (integration half): Exit code interpretation', () => {
  it('stores the exit code and records no_run for no_run and interrupted codes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.integer({ min: -2, max: 255 }), { nil: null }), async (code) => {
        const h = harness({ respond: (ghost) => (code === 0 || code === 3 ? savedResult(ghost, code) : { code, stdout: '', stderr: 'x', timedOut: code === null }) });
        await runPatrol(h.deps);
        const first = h.store.records[0]?.ghosts[0];
        expect(first?.exitCode).toBe(code);
        const kind = interpretExit(code).kind;
        if (kind !== 'saved') expect(first?.result).toBe('no_run');
        else expect(first?.result).not.toBe('no_run');
      }),
      RUNS,
    );
  });
});
