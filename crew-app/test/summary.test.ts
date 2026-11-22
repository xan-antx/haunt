import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GHOSTS, GHOST_NAMES } from '../src/ghosts.ts';
import { buildSummary, diffRecords, findingKey, selectPrevious } from '../src/summary.ts';
import { RUNS, arbDate, arbRecord, record } from './helpers.ts';

const WORDS = { succeeded: 'succeeded', gave_up: 'gave up', error: 'error', no_run: 'no saved run' } as const;

const arbPrevious = fc.oneof(
  fc.constant({ kind: 'none' as const }),
  arbDate.map((date) => ({ kind: 'unreadable' as const, date })),
  arbRecord.map((r) => ({ kind: 'record' as const, record: r })),
);

describe('Feature: haunt-patrol, Property 7: Summary covers every ghost and finding', () => {
  it('names each ghost, its result in plain words, and every finding title', () => {
    fc.assert(
      fc.property(arbRecord, arbPrevious, (current, previous) => {
        const text = buildSummary(current, previous);
        for (const entry of current.ghosts) {
          expect(text).toContain(GHOST_NAMES[entry.ghost]);
          expect(text).toContain(WORDS[entry.result]);
          for (const f of entry.findings) expect(text).toContain(f.title);
        }
      }),
      RUNS,
    );
  });
});

describe('Feature: haunt-patrol, Property 8: Findings are classified as new, fixed or unchanged', () => {
  const keysOf = (r: ReturnType<typeof record>): Set<string> => new Set(r.ghosts.flatMap((g) => g.findings.map((f) => findingKey(g.ghost, f))));

  it('classifies keys with a plain set diff and reports exactly the changed results', () => {
    fc.assert(
      fc.property(arbRecord, arbRecord, (current, previous) => {
        const diff = diffRecords(current, previous);
        const cur = keysOf(current);
        const prev = keysOf(previous);
        const byStatus = (s: string): Set<string> => new Set(diff.findings.filter((f) => f.status === s).map((f) => findingKey(f.ghost, f)));
        const added = byStatus('new');
        const fixed = byStatus('fixed');
        const same = byStatus('unchanged');
        expect(added).toEqual(new Set([...cur].filter((k) => !prev.has(k))));
        expect(fixed).toEqual(new Set([...prev].filter((k) => !cur.has(k))));
        expect(same).toEqual(new Set([...cur].filter((k) => prev.has(k))));
        expect(added.size + fixed.size + same.size).toBe(new Set([...cur, ...prev]).size);
        const changed = GHOSTS.filter((g) => current.ghosts.find((e) => e.ghost === g)?.result !== previous.ghosts.find((e) => e.ghost === g)?.result);
        expect(diff.resultChanges.map((c) => c.ghost)).toEqual(changed);
      }),
      RUNS,
    );
  });

  it('lists a fixed key only for a ghost with a saved run tonight, and never fixes a no_run ghost', () => {
    fc.assert(
      fc.property(arbRecord, arbRecord, (current, previous) => {
        const text = buildSummary(current, { kind: 'record', record: previous });
        const fixedLine = text.split('\n').find((l) => l.startsWith('Fixed findings')) ?? '';
        const diff = diffRecords(current, previous);
        for (const g of current.ghosts) {
          const missing = diff.findings.filter((f) => f.status === 'fixed' && f.ghost === g.ghost);
          if (g.result === 'no_run') {
            if (missing.length > 0) expect(text).toContain(`Not checked tonight (${GHOST_NAMES[g.ghost]} had no saved run)`);
            else expect(text).not.toContain(`Not checked tonight (${GHOST_NAMES[g.ghost]}`);
            expect(fixedLine).not.toContain(`${GHOST_NAMES[g.ghost]}, `);
          }
        }
        const fixedCount = diff.findings.filter((f) => f.status === 'fixed' && current.ghosts.find((e) => e.ghost === f.ghost)?.result !== 'no_run').length;
        expect(fixedLine).toContain(`Fixed findings (${fixedCount})`);
      }),
      RUNS,
    );
  });

  it('reports a no_run ghost\'s earlier findings as not checked tonight, not fixed', () => {
    const previous = record('2026-11-02', { phantom: { result: 'gave_up', findings: [{ type: 'zoom', step: 3, title: 'Text is too small' }] } });
    const current = record('2026-11-03', { phantom: { result: 'no_run' } });
    const text = buildSummary(current, { kind: 'record', record: previous });
    expect(text).toContain('Fixed findings (0).');
    expect(text).toContain('Not checked tonight (The Phantom had no saved run): "Text is too small" (zoom).');
  });
});

describe('Feature: haunt-patrol, Property 9: Comparing a record with itself shows no change', () => {
  it('has no new findings, no fixed findings, no result changes, and every finding unchanged', () => {
    fc.assert(
      fc.property(arbRecord, (r) => {
        const diff = diffRecords(r, r);
        expect(diff.findings.filter((f) => f.status === 'new')).toHaveLength(0);
        expect(diff.findings.filter((f) => f.status === 'fixed')).toHaveLength(0);
        expect(diff.resultChanges).toHaveLength(0);
        expect(diff.findings.every((f) => f.status === 'unchanged')).toBe(true);
        const distinct = new Set(r.ghosts.flatMap((g) => g.findings.map((f) => findingKey(g.ghost, f))));
        expect(diff.findings).toHaveLength(distinct.size);
      }),
      RUNS,
    );
  });
});

describe('Feature: haunt-patrol, Property 10: Previous record selection', () => {
  it('returns the greatest date strictly before the current one, or null', () => {
    fc.assert(
      fc.property(arbDate, fc.array(arbDate, { maxLength: 8 }), (date, dates) => {
        const earlier = dates.filter((d) => d < date).sort();
        expect(selectPrevious(date, dates)).toBe(earlier.length === 0 ? null : earlier[earlier.length - 1]);
      }),
      RUNS,
    );
  });

  it('says there is no previous patrol when the state is none', () => {
    fc.assert(
      fc.property(arbRecord, (r) => {
        expect(buildSummary(r, { kind: 'none' })).toContain('There is no previous patrol');
      }),
      RUNS,
    );
  });
});

describe('Feature: haunt-patrol, Property 11 (pure half): Unreadable previous record', () => {
  it('says the previous patrol was unreadable and leaves out the comparison', () => {
    fc.assert(
      fc.property(arbRecord, arbDate, (r, date) => {
        const text = buildSummary(r, { kind: 'unreadable', date });
        expect(text).toContain(`The previous patrol (${date}) was unreadable`);
        expect(text).not.toContain('## Compared with');
        expect(text).not.toMatch(/^(New|Fixed|Unchanged) findings \(/m);
      }),
      RUNS,
    );
  });
});
