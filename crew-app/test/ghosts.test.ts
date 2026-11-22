import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHauntArgs, GHOSTS, interpretExit } from '../src/ghosts.ts';
import { istDate, seedForDate } from '../src/istDate.ts';
import { arbDate, RUNS } from './helpers.ts';

describe('Feature: haunt-patrol, Property 3 (pure half): Command arguments and shared seed', () => {
  it('contains the required arguments, no haunt-mcp, and a safe-integer seed', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GHOSTS), arbDate, fc.string({ minLength: 1 }), (ghost, date, runsDir) => {
        const seed = seedForDate(date);
        const args = buildHauntArgs(ghost, seed, runsDir, 'cli.mjs');
        expect(Number.isSafeInteger(seed)).toBe(true);
        expect(args).toContain('run');
        const pairs = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
        expect(pairs('--ghost')).toBe(ghost);
        expect(pairs('--mission')).toBe('pay-bill');
        expect(pairs('--url')).toBe('http://localhost:3000');
        expect(pairs('--out')).toBe(runsDir);
        expect(pairs('--seed')).toBe(String(seed));
        expect(args.join(' ')).not.toContain('haunt-mcp');
      }),
      RUNS,
    );
  });

  it('turns an IST date into a seed', () => {
    expect(seedForDate('2026-11-03')).toBe(20261103);
  });

  it('uses the IST calendar day, not the UTC one', () => {
    expect(istDate(new Date('2026-11-02T20:00:00Z'))).toBe('2026-11-03');
    expect(istDate(new Date('2026-11-03T18:00:00Z'))).toBe('2026-11-03');
    expect(istDate(new Date('2026-11-03T18:30:00Z'))).toBe('2026-11-04');
  });
});

describe('Feature: haunt-patrol, Property 4 (pure half): Exit code interpretation', () => {
  it('saved for 0 and 3 only, interrupted for 130 only, no_run otherwise', () => {
    fc.assert(
      fc.property(fc.option(fc.integer({ min: -5, max: 300 }), { nil: null }), (code) => {
        const result = interpretExit(code);
        if (code === 0) expect(result).toEqual({ kind: 'saved', withError: false });
        else if (code === 3) expect(result).toEqual({ kind: 'saved', withError: true });
        else if (code === 130) expect(result).toEqual({ kind: 'interrupted' });
        else expect(result).toEqual({ kind: 'no_run' });
      }),
      RUNS,
    );
  });
});
