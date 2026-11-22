import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { istDate, seedForDate } from '../src/istDate.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { RUNS, harness } from './helpers.ts';

describe('Feature: haunt-patrol, Property 3 (integration half): Command arguments and shared seed', () => {
  it('sends the same seed from the clock to every command and into the record', async () => {
    await fc.assert(
      fc.asyncProperty(fc.date({ min: new Date('2001-01-01T00:00:00Z'), max: new Date('2098-12-31T00:00:00Z'), noInvalidDate: true }), async (instant) => {
        const h = harness({ now: instant });
        await runPatrol(h.deps);
        const seed = seedForDate(istDate(instant));
        expect(h.commands.calls).toHaveLength(3);
        for (const args of h.commands.calls) {
          expect(args[args.indexOf('--seed') + 1]).toBe(String(seed));
        }
        expect(h.store.records[0]?.seed).toBe(seed);
        expect(h.store.records[0]?.date).toBe(istDate(instant));
      }),
      RUNS,
    );
  });
});
