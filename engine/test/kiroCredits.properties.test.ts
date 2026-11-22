import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCredits } from '../src/mind/ai/kiro.ts';

/**
 * Feature: listener-ai-mind, Property 12: Credits parsing
 * **Validates: Requirements 5.8, 5.9**
 */
const RUNS = { numRuns: 100 };

/** Output lines that never contain the word "credits". */
const noise = fc.array(fc.string().filter((s) => !/credit/i.test(s)), { maxLength: 6 });
const amount = fc.tuple(fc.nat({ max: 5000 }), fc.option(fc.nat({ max: 99 }), { nil: undefined })).map(([whole, frac]) =>
  frac === undefined ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`,
);
const label = fc.constantFrom('Credits: ', 'credits: ', 'CREDITS: ', 'Credits used: ', 'credits used: ', 'Credits = ');

describe('Feature: listener-ai-mind, Property 12: Credits parsing', () => {
  it('returns the number from a credits line, wherever it sits in the output', () => {
    fc.assert(
      fc.property(noise, noise, label, amount, (before, after, prefix, value) => {
        const output = [...before, `${prefix}${value} • Time: 3s`, ...after].join('\n');
        expect(parseCredits(output)).toEqual({ known: true, credits: Number(value) });
      }),
      RUNS,
    );
  });

  it('returns known: false with a reason when no line has a credits number', () => {
    fc.assert(
      fc.property(noise, fc.constantFrom('', 'Credits: unknown', 'credits used soon'), (lines, extra) => {
        const result = parseCredits([...lines, extra].join('\n'));
        expect(result.known).toBe(false);
        if (!result.known) expect(result.reason.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });
});
