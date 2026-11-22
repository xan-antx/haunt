import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseRecord, serializeRecord, validateRecord } from '../src/record.ts';
import { RUNS, arbRecord, record } from './helpers.ts';

const good = record('2026-11-03', {
  listener: { result: 'gave_up', findings: [{ type: 'focus_trap', step: 20, title: 'Trapped' }] },
  phantom: { result: 'no_run' },
});

function mutate(change: (r: Record<string, any>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(good)) as Record<string, any>;
  change(copy);
  return copy;
}

describe('Patrol_Record schema', () => {
  it('accepts valid records', () => {
    expect(validateRecord(good).ok).toBe(true);
    expect(validateRecord(record('2026-01-01')).ok).toBe(true);
    expect(validateRecord(record('2026-01-02', { bebe: { result: 'error', findings: [{ type: 'a', step: 1, title: 'x' }, { type: 'a', step: 2, title: 'y' }] } })).ok).toBe(true);
  });

  it.each([
    ['wrong version', (r: Record<string, any>) => (r.version = 2)],
    ['bad date', (r: Record<string, any>) => (r.date = '3 Nov 2026')],
    ['unsafe seed', (r: Record<string, any>) => (r.seed = 2 ** 60)],
    ['fractional seed', (r: Record<string, any>) => (r.seed = 1.5)],
    ['missing ghost', (r: Record<string, any>) => r.ghosts.pop()],
    ['duplicated ghost', (r: Record<string, any>) => (r.ghosts[2].ghost = 'listener')],
    ['unknown ghost', (r: Record<string, any>) => (r.ghosts[2].ghost = 'zombie')],
    ['unknown result', (r: Record<string, any>) => (r.ghosts[0].result = 'won')],
    ['no_run with a run id', (r: Record<string, any>) => (r.ghosts[1].runId = 'x')],
    [
      'no_run with findings',
      (r: Record<string, any>) => {
        r.ghosts[1].findings = [{ type: 'a', step: 1, title: 't' }];
        r.ghosts[1].findingCounts = { a: 1 };
        r.ghosts[1].findingTitles = ['t'];
      },
    ],
    ['counts that disagree', (r: Record<string, any>) => (r.ghosts[0].findingCounts = { focus_trap: 2 })],
    ['titles that disagree', (r: Record<string, any>) => (r.ghosts[0].findingTitles = ['Other'])],
    ['non-boolean interrupted', (r: Record<string, any>) => (r.interrupted = 'no')],
  ])('rejects %s', (_name, change) => {
    const result = validateRecord(mutate(change));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects text that is not JSON', () => {
    expect(parseRecord('{nope').ok).toBe(false);
  });
});

describe('Feature: haunt-patrol, Property 5 (pure half): Patrol record round trip', () => {
  it('parseRecord(serializeRecord(record)) equals the record', () => {
    fc.assert(
      fc.property(arbRecord, (r) => {
        const parsed = parseRecord(serializeRecord(r));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.record).toEqual(r);
      }),
      RUNS,
    );
  });
});
