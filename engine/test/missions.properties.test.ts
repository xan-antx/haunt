import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expandMission } from '../src/cli/main.ts';
import { validateMission } from '../src/missions/loadMission.ts';
import type { Mission } from '../src/missions/loadMission.ts';
import { applyTemplates, futureExpiry, runStamp } from '../src/missions/templates.ts';

function payBill(): Mission {
  const file = fileURLToPath(new URL('../missions/pay-bill.json', import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as Mission;
}

describe('Feature: memos-real-world-haunt, Property 1: Mission schema accepts exactly the two last-resort values', () => {
  it('accepts a lastResort value only when it is unnamedButton or unnamedField', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom('unnamedButton', 'unnamedField')), (value) => {
        const mission = payBill();
        (mission.intentions[5] as unknown as Record<string, unknown>)['lastResort'] = value;
        const problems = validateMission(mission, 'pay-bill');
        expect(problems.length === 0).toBe(value === 'unnamedButton' || value === 'unnamedField');
      }),
      { numRuns: 100 },
    );
  });
});

const noPlaceholder = fc.string().filter((s) => !s.includes('{{'));
const dates = fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2090-12-31T23:59:59Z'), noInvalidDate: true });

describe('Feature: memos-real-world-haunt, Property 2: Template expansion is the identity without placeholders and total with them', () => {
  it('leaves text without placeholders unchanged', () => {
    fc.assert(
      fc.property(noPlaceholder, dates, (text, start) => {
        expect(applyTemplates(text, start)).toBe(text);
      }),
      { numRuns: 100 },
    );
  });

  it('replaces every placeholder, leaving none behind', () => {
    fc.assert(
      fc.property(noPlaceholder, noPlaceholder, dates, fc.integer({ min: 1, max: 4 }), (a, b, start, n) => {
        const text = Array.from({ length: n }, () => `${a}{{runStamp}}${b}{{futureExpiry}}`).join('|');
        const out = applyTemplates(text, start);
        expect(out).not.toContain('{{runStamp}}');
        expect(out).not.toContain('{{futureExpiry}}');
        expect(out).toContain(runStamp(start));
        expect(out).toContain(futureExpiry(start));
      }),
      { numRuns: 100 },
    );
  });

  it('formats the run stamp as YYYYMMDD-HHmmss in UTC', () => {
    expect(runStamp(new Date('2026-03-04T05:06:07Z'))).toBe('20260304-050607');
  });

  it('expands pay-bill to itself and expands goal, success check and values but not the requirement', () => {
    const start = new Date('2026-03-04T05:06:07Z');
    const bill = payBill();
    const expanded = expandMission(bill, start);
    expect(expanded.goal).toBe(bill.goal);
    expect(expanded.requirement).toBe(bill.requirement);
    expect(expanded.successCheck).toEqual(bill.successCheck);

    const withStamp: Mission = {
      ...bill,
      goal: 'Write {{runStamp}}',
      requirement: 'R {{runStamp}}',
      successCheck: { text: 'T {{runStamp}}', visible: 'V {{runStamp}}' },
    };
    const out = expandMission(withStamp, start);
    expect(out.goal).toBe('Write 20260304-050607');
    expect(out.successCheck).toEqual({ text: 'T 20260304-050607', visible: 'V 20260304-050607' });
    expect(out.requirement).toBe('R {{runStamp}}');
  });
});
