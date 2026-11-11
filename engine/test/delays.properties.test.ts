import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng.ts';
import { BEBE_REACTION_DELAY } from '../src/ghosts/bebe/profile.ts';
import { phantomTiming } from '../src/ghosts/phantom/profile.ts';
import { reactionDelayMs, type DelayRange } from '../src/ghosts/visual/body.ts';

/**
 * Feature: haunt-engine, Property 6: Reaction delays stay in range
 * **Validates: Requirements 13.4, 17.4, 20.2**
 *
 * For any 32-bit seed and any number of draws, The Phantom's Reaction_Delays are whole milliseconds in
 * [550, 650] and Bebe's in [1300, 1700], and the same seed always gives the same sequence.
 */

const RUNS = { numRuns: 100 };

// Any 32-bit seed, signed or unsigned: mulberry32 reduces both to an unsigned 32-bit state.
const seedArb = fc.oneof(
  fc.integer({ min: -0x8000_0000, max: 0x7fff_ffff }),
  fc.integer({ min: 0, max: 0xffff_ffff }),
);
const drawsArb = fc.integer({ min: 1, max: 200 });

/** The Reaction_Delays of one Run: `draws` clicks with the Run's seeded random numbers. */
function delaysFor(range: DelayRange, seed: number, draws: number): number[] {
  const rng = mulberry32(seed);
  return Array.from({ length: draws }, () => reactionDelayMs(range, rng));
}

const GHOSTS: ReadonlyArray<{ name: string; range: DelayRange; min: number; max: number }> = [
  { name: 'The Phantom', range: phantomTiming.reactionDelay, min: 550, max: 650 },
  { name: 'Bebe', range: BEBE_REACTION_DELAY, min: 1300, max: 1700 },
];

describe('Feature: haunt-engine, Property 6: Reaction delays stay in range', () => {
  for (const ghost of GHOSTS) {
    describe(ghost.name, () => {
      it(`uses the required range ${ghost.min}–${ghost.max} ms`, () => {
        expect({ minMs: ghost.range.minMs, maxMs: ghost.range.maxMs }).toEqual({
          minMs: ghost.min,
          maxMs: ghost.max,
        });
      });

      it('every delay is a whole number of milliseconds in range', () => {
        fc.assert(
          fc.property(seedArb, drawsArb, (seed, draws) => {
            const delays = delaysFor(ghost.range, seed, draws);
            expect(delays).toHaveLength(draws);
            for (const delay of delays) {
              expect(Number.isInteger(delay)).toBe(true);
              expect(delay).toBeGreaterThanOrEqual(ghost.min);
              expect(delay).toBeLessThanOrEqual(ghost.max);
            }
          }),
          RUNS,
        );
      });

      it('the same seed gives the same sequence of delays', () => {
        fc.assert(
          fc.property(seedArb, drawsArb, (seed, draws) => {
            expect(delaysFor(ghost.range, seed, draws)).toEqual(delaysFor(ghost.range, seed, draws));
          }),
          RUNS,
        );
      });

      it('a longer Run starts with the same delays as a shorter one with the same seed', () => {
        fc.assert(
          fc.property(seedArb, drawsArb, drawsArb, (seed, a, b) => {
            const [short, long] = a <= b ? [a, b] : [b, a];
            expect(delaysFor(ghost.range, seed, long).slice(0, short)).toEqual(
              delaysFor(ghost.range, seed, short),
            );
          }),
          RUNS,
        );
      });

      it('the extreme random numbers give the ends of the range', () => {
        expect(reactionDelayMs(ghost.range, () => 0)).toBe(ghost.min);
        expect(reactionDelayMs(ghost.range, () => 1 - Number.EPSILON)).toBe(ghost.max);
      });
    });
  }
});
