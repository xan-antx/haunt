import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EXIT, mapExitCode, type PatrolOutcome } from '../src/exitCode.ts';
import { RUNS } from './helpers.ts';

const arbOutcome: fc.Arbitrary<PatrolOutcome> = fc.oneof(
  fc.constant({ kind: 'prerequisite_missing' as const }),
  fc.constant({ kind: 'site_not_started' as const }),
  fc.constant({ kind: 'crashed' as const }),
  fc.nat({ max: 3 }).map((savedRuns) => ({ kind: 'ran' as const, savedRuns })),
);

describe('Feature: haunt-patrol, Property 12 (pure half): Exit code mapping', () => {
  it('maps every outcome to exactly one code', () => {
    fc.assert(
      fc.property(arbOutcome, (outcome) => {
        const code = mapExitCode(outcome);
        switch (outcome.kind) {
          case 'prerequisite_missing':
            return code === 1;
          case 'site_not_started':
            return code === 2;
          case 'crashed':
            return code === 4;
          case 'ran':
            return code === (outcome.savedRuns > 0 ? 0 : 3);
        }
      }),
      RUNS,
    );
  });

  it('has five distinct codes 0 to 4', () => {
    expect(EXIT).toEqual({ ok: 0, prerequisite: 1, siteNotStarted: 2, noRuns: 3, crashed: 4 });
    expect(new Set(Object.values(EXIT)).size).toBe(5);
  });

  it('returns each failure code for one kind of outcome only', () => {
    const kinds: PatrolOutcome[] = [
      { kind: 'prerequisite_missing' },
      { kind: 'site_not_started' },
      { kind: 'ran', savedRuns: 0 },
      { kind: 'crashed' },
      { kind: 'ran', savedRuns: 2 },
    ];
    expect(kinds.map(mapExitCode)).toEqual([1, 2, 3, 4, 0]);
  });
});
