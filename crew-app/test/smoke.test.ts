import { describe, expect, it } from 'vitest';
import { istDate } from '../src/istDate.ts';

describe('smoke', () => {
  it('runs the test suite and resolves .ts imports', () => {
    expect(istDate(new Date('2026-11-03T00:00:00Z'))).toBe('2026-11-03');
  });
});
