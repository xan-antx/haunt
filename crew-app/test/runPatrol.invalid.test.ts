import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runPatrol } from '../src/runPatrol.ts';
import { RUNS, harness } from './helpers.ts';

describe('Feature: haunt-patrol, Property 6 (integration half): Invalid run files never count as saved runs', () => {
  it('records no_run with no run id and an error text for any text that is not a run file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.string(), fc.constantFrom('{"result":"won"}', 'null', '[]', '{"result":"succeeded","findings":"none"}')),
        async (text) => {
          const h = harness({ files: () => text });
          expect(await runPatrol(h.deps)).toBe(3);
          for (const entry of h.store.records[0]?.ghosts ?? []) {
            expect(entry.result).toBe('no_run');
            expect(entry.runId).toBeNull();
            expect((entry.error ?? '').length).toBeGreaterThan(0);
          }
        },
      ),
      RUNS,
    );
  });

  it('records no_run when the file cannot be read', async () => {
    const h = harness({
      files: () => {
        throw new Error('ENOENT');
      },
    });
    expect(await runPatrol(h.deps)).toBe(3);
    expect(h.store.records[0]?.ghosts[0]?.error).toContain('ENOENT');
  });
});
