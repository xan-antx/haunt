import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMEOUT_MS, parseTimeoutMs } from '../src/mind/ai/kiro.ts';

/**
 * Feature: listener-ai-mind, Property 11: Timeout parsing
 * **Validates: Requirements 5.4**
 */
const RUNS = { numRuns: 100 };

describe('Feature: listener-ai-mind, Property 11: Timeout parsing', () => {
  it('returns the integer for any positive integer string', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (n) => {
        expect(parseTimeoutMs(String(n))).toBe(n);
      }),
      RUNS,
    );
  });

  it('returns 600000 for undefined and for any value that is not a positive integer', () => {
    expect(parseTimeoutMs(undefined)).toBe(600000);
    expect(DEFAULT_TIMEOUT_MS).toBe(600000);
    const notPositive = fc.oneof(
      fc.string().filter((s) => !/^\s*\d+\s*$/.test(s)),
      fc.constantFrom('', '0', '00', '-5', '1.5', '1e3', 'abc', '12ms', ' ', '+7'),
      fc.integer({ min: -1000, max: 0 }).map(String),
      fc.double({ noInteger: true, noNaN: true, noDefaultInfinity: true }).map(String).filter((s) => !/^\d+$/.test(s)),
      fc.constant('99999999999999999999999'),
    );
    fc.assert(
      fc.property(notPositive, (raw) => {
        expect(parseTimeoutMs(raw)).toBe(600000);
      }),
      RUNS,
    );
  });
});
